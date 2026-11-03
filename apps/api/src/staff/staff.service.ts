import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../common/audit.service";
import { normalizePage, toPage } from "../common/pagination";
import type { AuthenticatedUser } from "../common/decorators/current-user.decorator";
import type { AssignClassroomStaffDto, QueryStaffDto, UpdateStaffDto } from "./dto";

@Injectable()
export class StaffService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(query: QueryStaffDto) {
    const { skip, take, page, pageSize } = normalizePage(query);
    const where = {
      user: {
        deletedAt: null,
        ...(query.q
          ? {
              OR: [
                { email: { contains: query.q, mode: "insensitive" as const } },
                { firstName: { contains: query.q, mode: "insensitive" as const } },
                { lastName: { contains: query.q, mode: "insensitive" as const } },
              ],
            }
          : {}),
      },
    };
    const [items, total] = await Promise.all([
      this.prisma.staff.findMany({
        where,
        include: {
          user: { select: { id: true, email: true, firstName: true, lastName: true, phone: true, isActive: true, lastLoginAt: true } },
          classrooms: { include: { classroom: { select: { id: true, name: true, program: true } } } },
        },
        orderBy: { hiredAt: "desc" },
        skip,
        take,
      }),
      this.prisma.staff.count({ where }),
    ]);
    return toPage(items.map((s) => this.summary(s)), total, page, pageSize);
  }

  async get(id: string) {
    const staff = await this.prisma.staff.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, email: true, firstName: true, lastName: true, phone: true, isActive: true, lastLoginAt: true, createdAt: true } },
        classrooms: { include: { classroom: true } },
      },
    });
    if (!staff) throw new NotFoundException("Staff member not found");
    return this.summary(staff, true);
  }

  async update(id: string, dto: UpdateStaffDto, actor: AuthenticatedUser) {
    const existing = await this.prisma.staff.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Staff member not found");
    const staff = await this.prisma.staff.update({
      where: { id },
      data: { jobTitle: dto.jobTitle, department: dto.department, bio: dto.bio, qualifications: dto.qualifications },
      include: {
        user: { select: { id: true, email: true, firstName: true, lastName: true, phone: true, isActive: true, lastLoginAt: true } },
        classrooms: { include: { classroom: { select: { id: true, name: true, program: true } } } },
      },
    });
    await this.audit.log({ actorId: actor.id, action: "staff.updated", entity: "Staff", entityId: id });
    return this.summary(staff, true);
  }

  async assignClassroom(id: string, dto: AssignClassroomStaffDto, actor: AuthenticatedUser) {
    const staff = await this.prisma.staff.findUnique({ where: { id } });
    if (!staff) throw new NotFoundException("Staff member not found");
    const classroom = await this.prisma.classroom.findUnique({ where: { id: dto.classroomId } });
    if (!classroom) throw new NotFoundException("Classroom not found");
    await this.prisma.classroomStaff.upsert({
      where: { classroomId_staffId: { classroomId: dto.classroomId, staffId: id } },
      update: { roleInRoom: dto.roleInRoom ?? "TEACHER" },
      create: { classroomId: dto.classroomId, staffId: id, roleInRoom: dto.roleInRoom ?? "TEACHER" },
    });
    await this.audit.log({ actorId: actor.id, action: "staff.classroom_assigned", entity: "Staff", entityId: id, metadata: { classroomId: dto.classroomId } });
    return this.get(id);
  }

  async unassignClassroom(id: string, classroomId: string, actor: AuthenticatedUser) {
    await this.prisma.classroomStaff.deleteMany({ where: { staffId: id, classroomId } });
    await this.audit.log({ actorId: actor.id, action: "staff.classroom_unassigned", entity: "Staff", entityId: id, metadata: { classroomId } });
    return { message: "Classroom assignment removed" };
  }

  private summary(s: {
    id: string; jobTitle: string; department: string | null; hiredAt: Date; bio?: string | null; qualifications?: string | null;
    user: { id: string; email: string; firstName: string; lastName: string; phone: string | null; isActive: boolean; lastLoginAt: Date | null; createdAt?: Date };
    classrooms: { roleInRoom?: string; classroom: { id: string; name: string; program: string } }[];
  }, detailed = false) {
    const base = {
      id: s.id,
      userId: s.user.id,
      email: s.user.email,
      firstName: s.user.firstName,
      lastName: s.user.lastName,
      phone: s.user.phone,
      isActive: s.user.isActive,
      lastLoginAt: s.user.lastLoginAt,
      jobTitle: s.jobTitle,
      department: s.department,
      hiredAt: s.hiredAt,
      classrooms: s.classrooms.map((c) => ({ id: c.classroom.id, name: c.classroom.name, program: c.classroom.program, roleInRoom: c.roleInRoom ?? "TEACHER" })),
    };
    if (!detailed) return base;
    return { ...base, bio: s.bio ?? null, qualifications: s.qualifications ?? null, createdAt: s.user.createdAt ?? null };
  }
}
