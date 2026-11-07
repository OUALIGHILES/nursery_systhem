import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service.js";
import type { AuthenticatedUser } from "../../common/decorators/current-user.decorator.js";
import { normalizePage, toPage } from "../../common/pagination.js";
import type { InboxQueryDto } from "../dto/inbox-query.dto.js";

const SELECT = { id: true, type: true, channel: true, title: true, body: true, link: true, readAt: true, createdAt: true } as const;

/** Ownership-scoped data access for Notification. All predicates include userId. */
@Injectable()
export class NotificationRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findPage(user: AuthenticatedUser, query: InboxQueryDto) {
    const { skip, take, page, pageSize } = normalizePage(query);
    const q = query.q?.trim();
    const where = {
      userId: user.id,
      ...(query.status === "unread" ? { readAt: null } : {}),
      ...(query.status === "read" ? { readAt: { not: null } } : {}),
      ...(query.type ? { type: query.type as never } : {}),
      ...(q ? { OR: [{ title: { contains: q, mode: "insensitive" as const } }, { body: { contains: q, mode: "insensitive" as const } }] } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.notification.findMany({ where, orderBy: { createdAt: "desc" }, skip, take, select: SELECT }),
      this.prisma.notification.count({ where }),
    ]);
    return toPage(items, total, page, pageSize);
  }

  async unreadCount(user: AuthenticatedUser) {
    const count = await this.prisma.notification.count({ where: { userId: user.id, readAt: null } });
    return { unread: count };
  }

  async markRead(user: AuthenticatedUser, id: string) {
    const existing = await this.prisma.notification.findFirst({ where: { id, userId: user.id }, select: { id: true } });
    if (!existing) throw new NotFoundException("Notification not found");
    await this.prisma.notification.updateMany({ where: { id, userId: user.id, readAt: null }, data: { readAt: new Date() } });
    return { id, read: true };
  }

  async markAllRead(user: AuthenticatedUser) {
    const result = await this.prisma.notification.updateMany({ where: { userId: user.id, readAt: null }, data: { readAt: new Date() } });
    return { updated: result.count };
  }
}
