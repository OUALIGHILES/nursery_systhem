import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";
import { AuditService } from "../common/audit.service.js";
import type { AuthenticatedUser } from "../common/decorators/current-user.decorator.js";
import type { CreateClassroomDto, UpdateClassroomDto } from "./dto.js";

@Injectable()
export class ClassroomsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list() {
    const classrooms = await this.prisma.classroom.findMany({
      include: {
        teachers: { include: { staff: { include: { user: { select: { firstName: true, lastName: true } } } } } },
        _count: { select: { children: { where: { deletedAt: null, status: "ACTIVE" } } } },
      },
      orderBy: { name: "asc" },
    });
    return classrooms.map((c) => this.serialize(c));
  }

  async get(id: string) {
    const classroom = await this.prisma.classroom.findUnique({
      where: { id },
      include: {
        teachers: { include: { staff: { include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } } } } },
        children: { where: { deletedAt: null }, select: { id: true, firstName: true, lastName: true, status: true, dateOfBirth: true }, orderBy: [{ lastName: "asc" }] },
        _count: { select: { children: { where: { deletedAt: null, status: "ACTIVE" } } } },
      },
    });
    if (!classroom) throw new NotFoundException("Classroom not found");
    return this.serialize(classroom, true);
  }

  async create(dto: CreateClassroomDto, actor: AuthenticatedUser) {
    if (dto.ageGroupMin > dto.ageGroupMax) throw new BadRequestException("ageGroupMin must be <= ageGroupMax");
    const classroom = await this.prisma.classroom.create({
      data: {
        name: dto.name,
        program: dto.program,
        ageGroupMin: dto.ageGroupMin,
        ageGroupMax: dto.ageGroupMax,
        capacity: dto.capacity,
        room: dto.room ?? null,
        color: dto.color ?? null,
      },
      include: { teachers: true, _count: { select: { children: true } } },
    });
    await this.audit.log({ actorId: actor.id, action: "classroom.created", entity: "Classroom", entityId: classroom.id });
    return this.serialize(classroom);
  }

  async update(id: string, dto: UpdateClassroomDto, actor: AuthenticatedUser) {
    const existing = await this.prisma.classroom.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Classroom not found");
    const min = dto.ageGroupMin ?? existing.ageGroupMin;
    const max = dto.ageGroupMax ?? existing.ageGroupMax;
    if (min > max) throw new BadRequestException("ageGroupMin must be <= ageGroupMax");

    // Shrinking capacity below current occupancy is not allowed
    if (dto.capacity !== undefined) {
      const enrolled = await this.prisma.child.count({ where: { classroomId: id, deletedAt: null, status: "ACTIVE" } });
      if (dto.capacity < enrolled) {
        throw new ConflictException(`Capacity cannot be below current enrollment (${enrolled})`);
      }
    }

    const classroom = await this.prisma.classroom.update({
      where: { id },
      data: {
        name: dto.name,
        program: dto.program,
        ageGroupMin: dto.ageGroupMin,
        ageGroupMax: dto.ageGroupMax,
        capacity: dto.capacity,
        room: dto.room,
        color: dto.color,
        isActive: dto.isActive,
      },
      include: { teachers: { include: { staff: { include: { user: { select: { firstName: true, lastName: true } } } } } }, _count: { select: { children: { where: { deletedAt: null, status: "ACTIVE" } } } } },
    });
    await this.audit.log({ actorId: actor.id, action: "classroom.updated", entity: "Classroom", entityId: id });
    return this.serialize(classroom);
  }

  private serialize(c: {
    id: string; name: string; program: string; ageGroupMin: number; ageGroupMax: number; capacity: number;
    room: string | null; color: string | null; isActive: boolean; createdAt?: Date;
    teachers: Array<{ roleInRoom?: string | null; staff?: { id?: string | null; jobTitle?: string | null; user: { id?: string | null; firstName: string; lastName: string; email?: string | null } } | null }>;
    _count: { children: number };
    children?: { id: string; firstName: string; lastName: string; status: string; dateOfBirth: Date }[];
  }, detailed = false) {
    const base = {
      id: c.id,
      name: c.name,
      program: c.program,
      ageGroupMin: c.ageGroupMin,
      ageGroupMax: c.ageGroupMax,
      capacity: c.capacity,
      enrolled: c._count.children,
      availablePlaces: Math.max(0, c.capacity - c._count.children),
      room: c.room,
      color: c.color,
      isActive: c.isActive,
      teachers: c.teachers.map((t) => ({
        staffId: t.staff?.id ?? null,
        name: `${t.staff?.user?.firstName ?? ""} ${t.staff?.user?.lastName ?? ""}`.trim() || null,
        roleInRoom: t.roleInRoom ?? "TEACHER",
      })),
    };
    if (!detailed) return base;
    return { ...base, children: c.children ?? [] };
  }
}
