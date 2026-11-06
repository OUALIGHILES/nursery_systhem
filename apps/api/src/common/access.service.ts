import { ForbiddenException, Global, Injectable, Module, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";
import { isStaffRole } from "./guards/roles.guard.js";
import type { AuthenticatedUser } from "./decorators/current-user.decorator.js";

/** Resource-level authorization for child-scoped data. */
@Injectable()
export class AccessService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Assert `user` may access the given child:
   * staff roles may access all; parents only children linked to them.
   */
  async assertChildAccess(user: AuthenticatedUser, childId: string) {
    if (isStaffRole(user.role)) {
      // Staff: teacher/staff may only see children in classrooms they are assigned to
      if (user.role === "TEACHER" || user.role === "STAFF") {
        const child = await this.prisma.child.findFirst({
          where: { id: childId, deletedAt: null },
          select: { classroomId: true },
        });
        if (!child) throw new NotFoundException("Child not found");
        if (!child.classroomId) throw new ForbiddenException("Child is not assigned to a classroom");
        const assignment = await this.prisma.classroomStaff.findFirst({
          where: { classroomId: child.classroomId, staff: { userId: user.id } },
          select: { classroomId: true },
        });
        if (!assignment) throw new ForbiddenException("Child is outside your assigned classrooms");
      }
      return;
    }
    // Parents: only linked children
    const link = await this.prisma.childParent.findFirst({
      where: { childId, parent: { userId: user.id } },
      select: { childId: true },
    });
    if (!link) throw new ForbiddenException("You do not have access to this child");
  }

  /** IDs of children a parent may see (or all staff-visible children for staff). */
  async visibleChildIds(user: AuthenticatedUser): Promise<string[]> {
    if (user.role === "SUPER_ADMIN" || user.role === "ADMIN" || user.role === "DIRECTOR") {
      const all = await this.prisma.child.findMany({ where: { deletedAt: null }, select: { id: true } });
      return all.map((c) => c.id);
    }
    if (user.role === "TEACHER" || user.role === "STAFF") {
      const rows = await this.prisma.classroomStaff.findMany({
        where: { staff: { userId: user.id } },
        select: { classroomId: true },
      });
      const classroomIds = rows.map((r) => r.classroomId);
      if (classroomIds.length === 0) return [];
      const children = await this.prisma.child.findMany({
        where: { classroomId: { in: classroomIds }, deletedAt: null },
        select: { id: true },
      });
      return children.map((c) => c.id);
    }
    const rows = await this.prisma.childParent.findMany({
      where: { parent: { userId: user.id } },
      select: { childId: true },
    });
    return rows.map((r) => r.childId);
  }
}

@Global()
@Module({
  providers: [AccessService],
  exports: [AccessService],
})
export class AccessModule {}
