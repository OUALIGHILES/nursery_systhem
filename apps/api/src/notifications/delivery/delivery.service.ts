import { Inject, Injectable, Optional } from "@nestjs/common";
import { MessagingGateway } from "../../messaging/messaging.gateway.js";
import { CHAT_SERVER_EVENTS, userRoom } from "../../messaging/messaging.events.js";

/**
 * Best-effort Socket.IO delivery. PostgreSQL is the source of truth;
 * offline users get REST history. No-op when gateway/Server unavailable (worker).
 * Delivery never marks read and never writes rows (chat payload untouched).
 */
@Injectable()
export class NotificationDeliveryService {
  constructor(
    @Optional()
    @Inject(MessagingGateway)
    private readonly gateway?: MessagingGateway,
  ) {}

  async deliver(userId: string, row: { id: string; type: string; title: string; body: string; link: string | null; createdAt: Date }) {
    try {
      const server = this.gateway?.server;
      if (!server) return;
      server.to(userRoom(userId)).emit(CHAT_SERVER_EVENTS.NOTIFICATION, { notification: { ...row, readAt: null } });
    } catch {
      // Best-effort only.
    }
  }
}
