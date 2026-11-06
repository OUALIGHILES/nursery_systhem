import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";
import { AuditService } from "../common/audit.service.js";
import { OutboxService } from "../kafka/outbox.service.js";

/**
 * Controlled inspection and release of the transactional outbox.
 *
 * Historical backlog safety: this service is the **only** path that may
 * touch historical events. Nothing here runs automatically on startup.
 *
 * - listPending: read-only inspection (no status changes, no payloads
 *   with PII beyond topic/status/attempts metadata).
 * - skipHistorical: marks a single PENDING row as FAILED with an explicit
 *   admin reason, so it will never be published and never re-notify.
 * - releaseSingle: clears the historical hold for exactly one row by
 *   resetting nextRetryAt to now (the relay will then publish it once,
 *   deduplicated by ProcessedEvent).
 *
 * Temporary passwords generated for historical parents are not stored and
 * cannot be recovered — use the admin password-reset workflow instead.
 */
@Injectable()
export class OutboxControlService {
  private readonly logger = new Logger(OutboxControlService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
  ) {}

  /** Read-only peek at pending outbox rows (metadata only). */
  async listPending(limit = 50) {
    const rows = await this.prisma.outboxEvent.findMany({
      where: { status: "PENDING" },
      orderBy: { createdAt: "asc" },
      take: Math.min(Math.max(limit, 1), 200),
      select: { id: true, eventId: true, topic: true, status: true, attempts: true, lastError: true, nextRetryAt: true, createdAt: true, publishedAt: true },
    });
    return rows;
  }

  /** Aggregated counts for health endpoints. */
  async summary() {
    return this.outbox.getPendingSummary();
  }

  /**
   * Explicitly skip one historical event — marks FAILED, never sends.
   * Requires an admin actorId for the audit trail.
   */
  async skipHistorical(eventId: string, reason: string, actorId: string) {
    const row = await this.prisma.outboxEvent.findUnique({ where: { eventId } });
    if (!row) throw new NotFoundException("Outbox event not found");
    if (row.status !== "PENDING") {
      this.logger.warn(`outbox.skip_ignored {eventId: "${eventId}", status: "${row.status}"}`);
      return { eventId, skipped: false, status: row.status };
    }
    await this.prisma.outboxEvent.update({
      where: { eventId },
      data: { status: "FAILED", lastError: `Skipped by admin: ${reason.slice(0, 400)}`, nextRetryAt: new Date(Date.now() + 365 * 86400_000) },
    });
    await this.audit.log({
      actorId,
      action: "outbox.historical_skipped",
      entity: "OutboxEvent",
      entityId: eventId,
      metadata: { topic: row.topic, reason: reason.slice(0, 400) },
    });
    this.logger.log(`outbox.skip {eventId: "${eventId}", topic: "${row.topic}"}`);
    return { eventId, skipped: true, status: "FAILED" };
  }

  /**
   * Explicitly release exactly one event for the relay to publish.
   * The caller must have inspected the payload and confirmed no duplicate
   * notification is desired. Consumer idempotency (ProcessedEvent) still
   * applies.
   */
  async releaseSingle(eventId: string, actorId: string) {
    const row = await this.prisma.outboxEvent.findUnique({ where: { eventId } });
    if (!row) throw new NotFoundException("Outbox event not found");
    if (row.status !== "PENDING") {
      this.logger.warn(`outbox.release_ignored {eventId: "${eventId}", status: "${row.status}"}`);
      return { eventId, released: false, status: row.status };
    }
    await this.prisma.outboxEvent.update({
      where: { eventId },
      data: { nextRetryAt: new Date(), lastError: null },
    });
    await this.audit.log({
      actorId,
      action: "outbox.historical_released",
      entity: "OutboxEvent",
      entityId: eventId,
      metadata: { topic: row.topic },
    });
    this.logger.log(`outbox.release {eventId: "${eventId}", topic: "${row.topic}"}`);
    return { eventId, released: true, status: "PENDING" };
  }
}
