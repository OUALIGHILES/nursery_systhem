import { Injectable } from "@nestjs/common";
import type { AuthenticatedUser } from "../common/decorators/current-user.decorator.js";
import { NotificationRepository } from "./repository/notification.repository.js";
import { NotificationDeliveryService } from "./delivery/delivery.service.js";
import type { InboxQueryDto } from "./dto/inbox-query.dto.js";

/** Thin facade preserving the existing API contract (P7.1 replacement). */
@Injectable()
export class NotificationsService {
  constructor(
    private readonly repo: NotificationRepository,
    private readonly delivery: NotificationDeliveryService,
  ) {}

  list(user: AuthenticatedUser, query: InboxQueryDto) {
    return this.repo.findPage(user, query);
  }

  unreadCount(user: AuthenticatedUser) {
    return this.repo.unreadCount(user);
  }

  markRead(user: AuthenticatedUser, id: string) {
    return this.repo.markRead(user, id);
  }

  markAllRead(user: AuthenticatedUser) {
    return this.repo.markAllRead(user);
  }

  async notify(userId: string, row: { id: string; type: string; title: string; body: string; link: string | null; createdAt: Date }) {
    return this.delivery.deliver(userId, row);
  }
}
