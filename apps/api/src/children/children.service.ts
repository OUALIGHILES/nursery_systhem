import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AccessService } from "../common/access.service";
import { AuditService } from "../common/audit.service";
import { OutboxService } from "../kafka/outbox.service";
import { normalizePage, toPage } from "../common/pagination";
import { isStaffRole } from "../common/guards/roles.guard";
import type { AuthenticatedUser } from "../common/decorators/current-user.decorator";
import type { AssignClassroomDto, CreateChildDto, CreatePickupDto, LinkParentDto, QueryChildrenDto, UpdateChildDto } from "./dto";

const CHILD_INCLUDE = {
  classroom: true,
  parents: { include: { parent: { include: { user: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } } } } } },
  allergies: true,
  authorizedPickups: { where: { isActive: true } },
} as const;

@Injectable()
export class ChildrenService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
  ) {}

  async list(query: QueryChildrenDto, user: AuthenticatedUser) {
    const { skip, take, page, pageSize } = normalizePage(query);
    const visibleIds = await this.access.visibleChildIds(user);
    if (visibleIds.length === 0) return toPage([], 0, page, pageSize);

    const where = {
      id: { in: visibleIds },
      deletedAt: null,
      ...(query.classroomId ? { classroomId: query.classroomId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.q
        ? {
            OR: [
              { firstName: { contains: query.q, mode: "insensitive" as const } },
              { lastName: { contains: query.q, mode: "insensitive" as const } },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.child.findMany({ where, include: { classroom: true, parents: { include: { parent: { include: { user: { select: { firstName: true, lastName: true } } } } } } }, orderBy: [{ lastName: "asc" }, { firstName: "asc" }], skip, take }),
      this.prisma.child.count({ where }),
    ]);
    return toPage(items.map((c) => this.summary(c)), total, page, pageSize);
  }

  async get(id: string, user: AuthenticatedUser) {
    await this.access.assertChildAccess(user, id);
    const child = await this.prisma.child.findFirst({ where: { id, deletedAt: null }, include: CHILD_INCLUDE });
    if (!child) throw new NotFoundException("Child not found");
    return this.detail(child);
  }

  async create(dto: CreateChildDto, actor: AuthenticatedUser) {
    if (dto.classroomId) await this.assertClassroomCapacity(dto.classroomId, null);
    const dob = new Date(dto.dateOfBirth);
    if (Number.isNaN(dob.getTime()) || dob > new Date()) throw new BadRequestException("Invalid date of birth");

    const child = await this.prisma.$transaction(async (tx) => {
      const created = await tx.child.create({
        data: {
          firstName: dto.firstName,
          lastName: dto.lastName,
          dateOfBirth: dob,
          gender: dto.gender,
          classroomId: dto.classroomId ?? null,
          medicalNotes: dto.medicalNotes ?? null,
          bloodType: dto.bloodType ?? null,
        },
      });
      await this.outbox.enqueue("child.enrolled", { id: created.id, firstName: created.firstName, lastName: created.lastName, classroomId: created.classroomId }, tx);
      return created;
    });
    await this.audit.log({ actorId: actor.id, action: "child.created", entity: "Child", entityId: child.id });
    return this.get(child.id, actor);
  }

  async update(id: string, dto: UpdateChildDto, actor: AuthenticatedUser) {
    const existing = await this.prisma.child.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new NotFoundException("Child not found");
    if (!isStaffRole(actor.role)) throw new ForbiddenException("Only staff can update child records");
    if (dto.classroomId && dto.classroomId !== existing.classroomId) {
      await this.assertClassroomCapacity(dto.classroomId, id);
    }
    const child = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.child.update({
        where: { id },
        data: {
          firstName: dto.firstName,
          lastName: dto.lastName,
          dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : undefined,
          gender: dto.gender,
          classroomId: dto.classroomId === undefined ? undefined : dto.classroomId,
          medicalNotes: dto.medicalNotes === undefined ? undefined : dto.medicalNotes,
          bloodType: dto.bloodType === undefined ? undefined : dto.bloodType,
          status: dto.status,
        },
      });
      await this.outbox.enqueue("child.updated", { id: updated.id }, tx);
      return updated;
    });
    await this.audit.log({ actorId: actor.id, action: "child.updated", entity: "Child", entityId: id });
    return this.get(child.id, actor);
  }

  /** Archive (soft). Admin/director only. */
  async archive(id: string, actor: AuthenticatedUser) {
    const existing = await this.prisma.child.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new NotFoundException("Child not found");
    await this.prisma.child.update({ where: { id }, data: { status: "ARCHIVED" } });
    await this.audit.log({ actorId: actor.id, action: "child.archived", entity: "Child", entityId: id });
    return { message: "Child archived" };
  }

  /** Soft delete. ADMIN/SUPER_ADMIN only, enforced at controller via @Roles. */
  async remove(id: string, actor: AuthenticatedUser) {
    const existing = await this.prisma.child.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new NotFoundException("Child not found");
    await this.prisma.child.update({ where: { id }, data: { deletedAt: new Date(), status: "ARCHIVED" } });
    await this.audit.log({ actorId: actor.id, action: "child.deleted", entity: "Child", entityId: id });
    return { message: "Child deleted" };
  }

  async assignClassroom(id: string, dto: AssignClassroomDto, actor: AuthenticatedUser) {
    const existing = await this.prisma.child.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new NotFoundException("Child not found");
    if (dto.classroomId) await this.assertClassroomCapacity(dto.classroomId, id);
    await this.prisma.child.update({ where: { id }, data: { classroomId: dto.classroomId } });
    await this.audit.log({ actorId: actor.id, action: "child.classroom_assigned", entity: "Child", entityId: id, metadata: { classroomId: dto.classroomId } });
    return this.get(id, actor);
  }

  async linkParent(id: string, dto: LinkParentDto, actor: AuthenticatedUser) {
    const child = await this.prisma.child.findFirst({ where: { id, deletedAt: null } });
    if (!child) throw new NotFoundException("Child not found");
    const parent = await this.prisma.parent.findUnique({ where: { id: dto.parentId } });
    if (!parent) throw new NotFoundException("Parent not found");
    const existing = await this.prisma.childParent.findUnique({ where: { childId_parentId: { childId: id, parentId: dto.parentId } } });
    if (existing) throw new ConflictException("Parent already linked to this child");
    await this.prisma.$transaction(async (tx) => {
      if (dto.isPrimary) {
        await tx.childParent.updateMany({ where: { childId: id }, data: { isPrimary: false } });
      }
      await tx.childParent.create({ data: { childId: id, parentId: dto.parentId, relation: dto.relation, isPrimary: dto.isPrimary ?? false, canPickup: dto.canPickup ?? true } });
    });
    await this.audit.log({ actorId: actor.id, action: "child.parent_linked", entity: "Child", entityId: id, metadata: { parentId: dto.parentId } });
    return this.get(id, actor);
  }

  async unlinkParent(id: string, parentId: string, actor: AuthenticatedUser) {
    const existing = await this.prisma.childParent.findUnique({ where: { childId_parentId: { childId: id, parentId } } });
    if (!existing) throw new NotFoundException("Link not found");
    await this.prisma.childParent.delete({ where: { childId_parentId: { childId: id, parentId } } });
    await this.audit.log({ actorId: actor.id, action: "child.parent_unlinked", entity: "Child", entityId: id, metadata: { parentId } });
    return { message: "Parent unlinked" };
  }

  async addPickup(id: string, dto: CreatePickupDto, actor: AuthenticatedUser) {
    await this.access.assertChildAccess(actor, id);
    const child = await this.prisma.child.findFirst({ where: { id, deletedAt: null } });
    if (!child) throw new NotFoundException("Child not found");
    const pickup = await this.prisma.authorizedPickup.create({ data: { childId: id, fullName: dto.fullName, relation: dto.relation, phone: dto.phone, idDocument: dto.idDocument ?? null } });
    await this.audit.log({ actorId: actor.id, action: "child.pickup_added", entity: "AuthorizedPickup", entityId: pickup.id });
    return pickup;
  }

  async removePickup(id: string, pickupId: string, actor: AuthenticatedUser) {
    await this.access.assertChildAccess(actor, id);
    const existing = await this.prisma.authorizedPickup.findFirst({ where: { id: pickupId, childId: id } });
    if (!existing) throw new NotFoundException("Authorized pickup not found");
    await this.prisma.authorizedPickup.update({ where: { id: pickupId }, data: { isActive: false } });
    await this.audit.log({ actorId: actor.id, action: "child.pickup_removed", entity: "AuthorizedPickup", entityId: pickupId });
    return { message: "Authorized pickup removed" };
  }

  /** Full profile for the child: attendance, activity, meals, documents, health (health restricted). */
  async profile(id: string, user: AuthenticatedUser) {
    await this.access.assertChildAccess(user, id);
    const child = await this.prisma.child.findFirst({ where: { id, deletedAt: null }, include: CHILD_INCLUDE });
    if (!child) throw new NotFoundException("Child not found");
    const [attendances, mealRecords, participations, documents, medicationRecords, incidents] = await Promise.all([
      this.prisma.attendance.findMany({ where: { childId: id }, orderBy: { date: "desc" }, take: 60 }),
      this.prisma.mealRecord.findMany({ where: { childId: id }, include: { meal: true }, orderBy: { meal: { date: "desc" } }, take: 60 }),
      this.prisma.activityParticipation.findMany({ where: { childId: id }, include: { activity: true }, orderBy: { activity: { scheduledAt: "desc" } }, take: 60 }),
      this.prisma.document.findMany({ where: { childId: id }, orderBy: { createdAt: "desc" } }),
      this.prisma.medicationRecord.findMany({ where: { childId: id }, include: { administeredBy: { select: { firstName: true, lastName: true } } }, orderBy: { administeredAt: "desc" }, take: 60 }),
      this.prisma.incident.findMany({ where: { childId: id }, orderBy: { occurredAt: "desc" }, take: 30 }),
    ]);
    return {
      ...this.detail(child),
      attendances,
      mealRecords: mealRecords.map((r) => ({ id: r.id, consumption: r.consumption, notes: r.notes, meal: { id: r.meal.id, date: r.meal.date, mealType: r.meal.mealType, name: r.meal.name } })),
      participations: participations.map((p) => ({ id: p.id, status: p.status, notes: p.notes, activity: { id: p.activity.id, title: p.activity.title, scheduledAt: p.activity.scheduledAt } })),
      documents: documents.map((d) => ({ id: d.id, type: d.type, fileName: d.fileName, mimeType: d.mimeType, sizeBytes: d.sizeBytes, createdAt: d.createdAt, visibility: d.visibility })),
      medicationRecords: medicationRecords.map((m) => ({ id: m.id, medication: m.medication, dosage: m.dosage, administeredAt: m.administeredAt, administeredBy: m.administeredBy ? `${m.administeredBy.firstName} ${m.administeredBy.lastName}` : null, notes: m.notes })),
      incidents,
    };
  }

  async assertClassroomCapacity(classroomId: string, excludeChildId: string | null) {
    const classroom = await this.prisma.classroom.findUnique({ where: { id: classroomId } });
    if (!classroom || !classroom.isActive) throw new NotFoundException("Classroom not found");
    const count = await this.prisma.child.count({
      where: { classroomId, deletedAt: null, status: "ACTIVE", ...(excludeChildId ? { id: { not: excludeChildId } } : {}) },
    });
    if (count >= classroom.capacity) {
      throw new BadRequestException(`Classroom "${classroom.name}" is at capacity (${classroom.capacity})`);
    }
  }

  private summary(c: { id: string; firstName: string; lastName: string; dateOfBirth: Date; gender: string; status: string; photoUrl: string | null; classroom: { id: string; name: string; program: string } | null; parents: { parent: { user: { firstName: string; lastName: string } } }[] }) {
    return {
      id: c.id,
      firstName: c.firstName,
      lastName: c.lastName,
      dateOfBirth: c.dateOfBirth,
      gender: c.gender,
      status: c.status,
      photoUrl: c.photoUrl,
      classroom: c.classroom ? { id: c.classroom.id, name: c.classroom.name, program: c.classroom.program } : null,
      parents: c.parents.map((p) => `${p.parent.user.firstName} ${p.parent.user.lastName}`),
    };
  }

  private detail(c: { id: string; firstName: string; lastName: string; dateOfBirth: Date; gender: string; status: string; photoUrl: string | null; medicalNotes: string | null; bloodType: string | null; createdAt: Date; classroom: { id: string; name: string; program: string; capacity: number } | null; parents: { relation: string; isPrimary: boolean; canPickup: boolean; parent: { id: string; address: string | null; user: { id: string; firstName: string; lastName: string; email: string; phone: string | null } } }[]; allergies: { id: string; allergen: string; severity: string; notes: string | null }[]; authorizedPickups: { id: string; fullName: string; relation: string; phone: string }[] }) {
    return {
      id: c.id,
      firstName: c.firstName,
      lastName: c.lastName,
      dateOfBirth: c.dateOfBirth,
      gender: c.gender,
      status: c.status,
      photoUrl: c.photoUrl,
      medicalNotes: c.medicalNotes,
      bloodType: c.bloodType,
      createdAt: c.createdAt,
      classroom: c.classroom ? { id: c.classroom.id, name: c.classroom.name, program: c.classroom.program, capacity: c.classroom.capacity } : null,
      parents: c.parents.map((p) => ({ parentId: p.parent.id, userId: p.parent.user.id, relation: p.relation, isPrimary: p.isPrimary, canPickup: p.canPickup, firstName: p.parent.user.firstName, lastName: p.parent.user.lastName, email: p.parent.user.email, phone: p.parent.user.phone, address: p.parent.address })),
      allergies: c.allergies,
      authorizedPickups: c.authorizedPickups,
    };
  }
}
