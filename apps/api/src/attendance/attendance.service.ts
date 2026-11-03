import {
  BadRequestException,
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
import type { AttendanceRangeDto, CheckInDto, CheckOutDto, MarkAbsentDto, QueryAttendanceDto } from "./dto";
import type { AttendanceStatus } from "../generated/prisma/enums";
import type { Prisma } from "../generated/prisma/client";

/** Arrival after this local time marks the child as LATE. */
const LATE_AFTER = { hour: 9, minute: 30 };

@Injectable()
export class AttendanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
  ) {}

  async checkIn(dto: CheckInDto, actor: AuthenticatedUser) {
    if (!isStaffRole(actor.role)) throw new ForbiddenException("Only staff can check children in");
    await this.access.assertChildAccess(actor, dto.childId);
    const child = await this.prisma.child.findFirst({ where: { id: dto.childId, deletedAt: null, status: "ACTIVE" } });
    if (!child) throw new NotFoundException("Child not found or not active");

    const now = new Date();
    const date = startOfDay(now);
    const late = now.getHours() > LATE_AFTER.hour || (now.getHours() === LATE_AFTER.hour && now.getMinutes() > LATE_AFTER.minute);
    const status: AttendanceStatus = late ? "LATE" : "PRESENT";

    const record = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.attendance.findUnique({ where: { childId_date: { childId: dto.childId, date } } });
      if (existing?.checkInAt) throw new BadRequestException("Child already checked in today");
      const upserted = existing
        ? await tx.attendance.update({
            where: { id: existing.id },
            data: { checkInAt: now, checkedInById: actor.id, status, pickedUpById: dto.pickedUpById ?? null, notes: dto.notes ?? existing.notes },
          })
        : await tx.attendance.create({
            data: { childId: dto.childId, date, status, checkInAt: now, checkedInById: actor.id, pickedUpById: dto.pickedUpById ?? null, notes: dto.notes ?? null },
          });
      await this.outbox.enqueue(
        "attendance.checked_in",
        { id: upserted.id, childId: child.id, childName: `${child.firstName} ${child.lastName}`, date: date.toISOString().slice(0, 10), time: now.toISOString().slice(11, 16), status, parentUserIds: await this.parentUserIds(tx, child.id) },
        tx,
      );
      return upserted;
    });

    await this.audit.log({ actorId: actor.id, action: "attendance.checked_in", entity: "Attendance", entityId: record.id, metadata: { childId: dto.childId } });
    return this.serialize(record, child);
  }

  async checkOut(dto: CheckOutDto, actor: AuthenticatedUser) {
    if (!isStaffRole(actor.role)) throw new ForbiddenException("Only staff can check children out");
    await this.access.assertChildAccess(actor, dto.childId);
    const child = await this.prisma.child.findFirst({ where: { id: dto.childId, deletedAt: null } });
    if (!child) throw new NotFoundException("Child not found");

    if (dto.pickupId) {
      const pickup = await this.prisma.authorizedPickup.findFirst({ where: { id: dto.pickupId, childId: dto.childId, isActive: true } });
      if (!pickup) throw new BadRequestException("Pickup verification failed: not an active authorized pickup for this child");
    }

    const now = new Date();
    const date = startOfDay(now);
    const record = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.attendance.findUnique({ where: { childId_date: { childId: dto.childId, date } } });
      if (!existing?.checkInAt) throw new BadRequestException("Child has not been checked in today");
      if (existing.checkOutAt) throw new BadRequestException("Child already checked out today");
      const updated = await tx.attendance.update({
        where: { id: existing.id },
        data: { checkOutAt: now, checkedOutById: actor.id, pickedUpById: dto.pickupId ?? existing.pickedUpById, notes: dto.notes ?? existing.notes },
      });
      await this.outbox.enqueue(
        "attendance.checked_out",
        { id: updated.id, childId: child.id, childName: `${child.firstName} ${child.lastName}`, date: date.toISOString().slice(0, 10), time: now.toISOString().slice(11, 16), parentUserIds: await this.parentUserIds(tx, child.id) },
        tx,
      );
      return updated;
    });

    await this.audit.log({ actorId: actor.id, action: "attendance.checked_out", entity: "Attendance", entityId: record.id, metadata: { childId: dto.childId, pickupId: dto.pickupId ?? null } });
    return this.serialize(record, child);
  }

  async markAbsent(dto: MarkAbsentDto, actor: AuthenticatedUser) {
    const isParent = actor.role === "PARENT";
    if (!isStaffRole(actor.role) && !isParent) throw new ForbiddenException();
    await this.access.assertChildAccess(actor, dto.childId);
    const child = await this.prisma.child.findFirst({ where: { id: dto.childId, deletedAt: null } });
    if (!child) throw new NotFoundException("Child not found");

    const date = dto.date ? startOfDay(new Date(dto.date)) : startOfDay(new Date());
    if (Number.isNaN(date.getTime())) throw new BadRequestException("Invalid date");
    const status: AttendanceStatus = dto.status ?? "ABSENT";

    const record = await this.prisma.$transaction(async (tx) => {
      const upserted = await tx.attendance.upsert({
        where: { childId_date: { childId: dto.childId, date } },
        create: { childId: dto.childId, date, status, notes: dto.reason ?? null },
        update: { status, notes: dto.reason ?? undefined },
      });
      await this.outbox.enqueue(
        "attendance.absent",
        { id: upserted.id, childId: child.id, childName: `${child.firstName} ${child.lastName}`, date: date.toISOString().slice(0, 10), status, reason: dto.reason ?? null, parentUserIds: await this.parentUserIds(tx, child.id) },
        tx,
      );
      return upserted;
    });

    await this.audit.log({ actorId: actor.id, action: "attendance.absent", entity: "Attendance", entityId: record.id, metadata: { childId: dto.childId, status } });
    return this.serialize(record, child);
  }

  async list(query: QueryAttendanceDto, user: AuthenticatedUser) {
    const { skip, take, page, pageSize } = normalizePage(query);
    const visibleIds = await this.access.visibleChildIds(user);
    if (query.childId && !visibleIds.includes(query.childId)) {
      throw new ForbiddenException("You do not have access to this child");
    }
    const where = {
      childId: query.childId ?? { in: visibleIds },
      ...(query.status ? { status: query.status } : {}),
      ...(query.date ? { date: startOfDay(new Date(query.date)) } : {}),
      ...(query.classroomId ? { child: { classroomId: query.classroomId } } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.attendance.findMany({
        where,
        include: {
          child: { select: { id: true, firstName: true, lastName: true, classroomId: true } },
          checkedInBy: { select: { firstName: true, lastName: true } },
          checkedOutBy: { select: { firstName: true, lastName: true } },
        },
        orderBy: [{ date: "desc" }, { childId: "asc" }],
        skip,
        take,
      }),
      this.prisma.attendance.count({ where }),
    ]);
    return toPage(items.map((r) => this.serialize(r, r.child, true)), total, page, pageSize);
  }

  /** Calendar summary for a month, optionally for one child. */
  async calendar(month: string, childId: string | undefined, user: AuthenticatedUser) {
    if (!/^\d{4}-\d{2}$/.test(month)) throw new BadRequestException("month must be YYYY-MM");
    const [year, mon] = month.split("-").map(Number);
    const from = new Date(Date.UTC(year, mon - 1, 1));
    const to = new Date(Date.UTC(year, mon, 1));
    const visibleIds = await this.access.visibleChildIds(user);
    if (childId && !visibleIds.includes(childId)) throw new ForbiddenException();
    const rows = await this.prisma.attendance.findMany({
      where: { childId: childId ?? { in: visibleIds }, date: { gte: from, lt: to } },
      include: { child: { select: { id: true, firstName: true, lastName: true } } },
      orderBy: { date: "asc" },
    });
    return rows.map((r) => this.serialize(r, r.child, true));
  }

  async report(range: AttendanceRangeDto, user: AuthenticatedUser) {
    const visibleIds = await this.access.visibleChildIds(user);
    if (range.childId && !visibleIds.includes(range.childId)) throw new ForbiddenException();
    const from = range.from ? startOfDay(new Date(range.from)) : new Date(Date.now() - 30 * 86400_000);
    const to = range.to ? new Date(startOfDay(new Date(range.to)).getTime() + 86400_000) : new Date();
    const where = {
      childId: range.childId ?? { in: visibleIds },
      date: { gte: from, lt: to },
      ...(range.classroomId ? { child: { classroomId: range.classroomId } } : {}),
    };
    const grouped = await this.prisma.attendance.groupBy({ by: ["status"], where, _count: { _all: true } });
    const totals: Record<string, number> = { PRESENT: 0, LATE: 0, ABSENT: 0, EXCUSED: 0 };
    for (const row of grouped) totals[row.status] = row._count._all;
    const total = Object.values(totals).reduce((a, b) => a + b, 0);
    const attended = totals.PRESENT + totals.LATE;
    return {
      from: from.toISOString().slice(0, 10),
      to: new Date(to.getTime() - 86400_000).toISOString().slice(0, 10),
      totals,
      total,
      attendanceRate: total > 0 ? Math.round((attended / total) * 1000) / 10 : 0,
    };
  }

  private async parentUserIds(tx: Prisma.TransactionClient, childId: string): Promise<string[]> {
    const links = await tx.childParent.findMany({ where: { childId }, select: { parent: { select: { userId: true } } } });
    return links.map((l) => l.parent.userId);
  }

  private serialize(r: {
    id: string; childId: string; date: Date; status: AttendanceStatus; checkInAt: Date | null; checkOutAt: Date | null;
    notes: string | null;
    checkedInBy?: { firstName: string; lastName: string } | null;
    checkedOutBy?: { firstName: string; lastName: string } | null;
  }, child: { id: string; firstName: string; lastName: string }, detailed = false) {
    const base = {
      id: r.id,
      childId: r.childId,
      childName: `${child.firstName} ${child.lastName}`,
      date: r.date.toISOString().slice(0, 10),
      status: r.status,
      checkInAt: r.checkInAt,
      checkOutAt: r.checkOutAt,
      notes: r.notes,
    };
    if (!detailed) return base;
    return {
      ...base,
      checkedInBy: r.checkedInBy ? `${r.checkedInBy.firstName} ${r.checkedInBy.lastName}` : null,
      checkedOutBy: r.checkedOutBy ? `${r.checkedOutBy.firstName} ${r.checkedOutBy.lastName}` : null,
    };
  }
}

function startOfDay(d: Date): Date {
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
}
