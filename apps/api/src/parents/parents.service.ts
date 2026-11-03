import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../common/audit.service";
import { normalizePage, toPage } from "../common/pagination";
import type { AuthenticatedUser } from "../common/decorators/current-user.decorator";
import type { QueryParentsDto, UpdateParentDto } from "./dto";

@Injectable()
export class ParentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(query: QueryParentsDto) {
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
      this.prisma.parent.findMany({
        where,
        include: {
          user: { select: { id: true, email: true, firstName: true, lastName: true, phone: true, isActive: true, lastLoginAt: true, createdAt: true } },
          children: { include: { child: { select: { id: true, firstName: true, lastName: true, status: true } } } },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take,
      }),
      this.prisma.parent.count({ where }),
    ]);
    return toPage(items.map((p) => this.summary(p)), total, page, pageSize);
  }

  async get(id: string) {
    const parent = await this.prisma.parent.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, email: true, firstName: true, lastName: true, phone: true, isActive: true, emailVerifiedAt: true, lastLoginAt: true, createdAt: true } },
        children: { include: { child: { include: { classroom: true } } } },
      },
    });
    if (!parent) throw new NotFoundException("Parent not found");
    return this.summary(parent, true);
  }

  async update(id: string, dto: UpdateParentDto, actor: AuthenticatedUser) {
    const existing = await this.prisma.parent.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Parent not found");
    const parent = await this.prisma.parent.update({
      where: { id },
      data: { address: dto.address, occupation: dto.occupation },
      include: { user: { select: { id: true, email: true, firstName: true, lastName: true, phone: true, isActive: true, lastLoginAt: true, createdAt: true } }, children: { include: { child: { select: { id: true, firstName: true, lastName: true, status: true } } } } },
    });
    await this.audit.log({ actorId: actor.id, action: "parent.updated", entity: "Parent", entityId: id });
    return this.summary(parent, true);
  }

  /** Communication history: messages sent/received by this parent's account. */
  async messages(id: string) {
    const parent = await this.prisma.parent.findUnique({ where: { id }, select: { userId: true } });
    if (!parent) throw new NotFoundException("Parent not found");
    return this.prisma.message.findMany({
      where: { OR: [{ senderId: parent.userId }, { recipientId: parent.userId }] },
      include: { sender: { select: { firstName: true, lastName: true, role: { select: { name: true } } } }, recipient: { select: { firstName: true, lastName: true, role: { select: { name: true } } } } },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  }

  async setActive(id: string, isActive: boolean, actor: AuthenticatedUser) {
    const parent = await this.prisma.parent.findUnique({ where: { id }, select: { userId: true } });
    if (!parent) throw new NotFoundException("Parent not found");
    await this.prisma.user.update({ where: { id: parent.userId }, data: { isActive } });
    await this.audit.log({ actorId: actor.id, action: isActive ? "parent.activated" : "parent.deactivated", entity: "Parent", entityId: id });
    return { message: isActive ? "Parent activated" : "Parent deactivated" };
  }

  private summary(p: {
    id: string; occupation: string | null; address: string | null;
    user: { id: string; email: string; firstName: string; lastName: string; phone: string | null; isActive: boolean; lastLoginAt: Date | null; createdAt: Date; emailVerifiedAt?: Date | null };
    children: { relation: string; isPrimary: boolean; canPickup: boolean; child: { id: string; firstName: string; lastName: string; status?: string; classroom?: { id: string; name: string } | null } }[];
  }, detailed = false) {
    const base = {
      id: p.id,
      userId: p.user.id,
      email: p.user.email,
      firstName: p.user.firstName,
      lastName: p.user.lastName,
      phone: p.user.phone,
      isActive: p.user.isActive,
      lastLoginAt: p.user.lastLoginAt,
      createdAt: p.user.createdAt,
      occupation: p.occupation,
      children: p.children.map((c) => ({ id: c.child.id, firstName: c.child.firstName, lastName: c.child.lastName, relation: c.relation, isPrimary: c.isPrimary, canPickup: c.canPickup, classroom: c.child.classroom ? { id: c.child.classroom.id, name: c.child.classroom.name } : null })),
    };
    if (!detailed) return base;
    return { ...base, address: p.address, emailVerifiedAt: p.user.emailVerifiedAt ?? null };
  }
}
