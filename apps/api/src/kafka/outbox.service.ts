import { Injectable, Logger, Optional } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { randomUUID } from "crypto";
import { PrismaService } from "../prisma/prisma.service.js";
import { KafkaProducerService } from "./kafka.producer.js";
import { KAFKA, type KafkaTopicName } from "./topics.js";
import type { Env } from "../config/env.js";
import type { Prisma } from "../generated/prisma/client.js";

type Tx = Prisma.TransactionClient;

export interface PublishSummary {
  published: number;
  failed: number;
  skippedHistorical: number;
  attempted: number;
}

export interface OutboxPendingSummary {
  pending: number;
  published: number;
  failed: number;
  byTopic: Array<{ topic: string; status: string; count: number }>;
}

/**
 * Transactional Outbox: business code writes the domain event to the
 * OutboxEvent table inside the same DB transaction as the state change.
 * A background relay (worker process only) publishes pending rows to
 * Kafka and marks them published, so events are never lost between DB
 * commit and Kafka send.
 *
 * Historical backlog safety: events created before
 * OUTBOX_HISTORICAL_CUTOFF_ISO are never auto-published. They must be
 * inspected and explicitly released/skipped by an admin (see
 * OutboxControlService). This prevents duplicate approval notifications
 * from events that predated the worker.
 */
@Injectable()
export class OutboxService {
  private readonly logger = new Logger(OutboxService.name);
  private readonly historicalCutoff: Date | null;
  private readonly defaultBatchSize: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly kafka: KafkaProducerService,
    @Optional() config?: ConfigService<Env, true>,
  ) {
    const cutoffRaw = config?.get("OUTBOX_HISTORICAL_CUTOFF_ISO", { infer: true }) ?? "";
    const parsed = cutoffRaw ? new Date(cutoffRaw) : null;
    this.historicalCutoff = parsed && !Number.isNaN(parsed.getTime()) ? parsed : null;
    this.defaultBatchSize = config?.get("OUTBOX_BATCH_SIZE", { infer: true }) ?? 50;
  }

  /** Enqueue an event. Pass `tx` to participate in an open transaction. */
  async enqueue(
    topic: KafkaTopicName,
    payload: Record<string, unknown>,
    tx?: Tx,
  ): Promise<string> {
    const eventId = randomUUID();
    const client = tx ?? this.prisma;
    await client.outboxEvent.create({
      data: { eventId, topic, payload: payload as object },
    });
    return eventId;
  }

  /**
   * Publish due pending events. Called by the worker relay on an interval.
   * Historical rows (created before the cutoff) are counted as
   * skippedHistorical and left untouched — never auto-published.
   */
  async publishPending(batchSize?: number): Promise<PublishSummary> {
    const size = batchSize ?? this.defaultBatchSize;
    const now = new Date();
    const due = await this.prisma.outboxEvent.findMany({
      where: { status: "PENDING", nextRetryAt: { lte: now } },
      orderBy: { createdAt: "asc" },
      take: size,
    });

    const summary: PublishSummary = { published: 0, failed: 0, skippedHistorical: 0, attempted: 0 };
    for (const event of due) {
      if (this.historicalCutoff && event.createdAt < this.historicalCutoff) {
        summary.skippedHistorical++;
        continue;
      }
      summary.attempted++;
      try {
        const ok = await this.kafka.publish(event.topic, event.eventId, event.payload);
        if (!ok) throw new Error("Kafka producer unavailable");
        await this.prisma.outboxEvent.update({
          where: { id: event.id },
          data: { status: "PUBLISHED", publishedAt: new Date(), lastError: null },
        });
        summary.published++;
        this.logger.log(`outbox.published {topic: "${event.topic}", eventId: "${event.eventId}"}`);
      } catch (err) {
        const attempts = event.attempts + 1;
        const failed = attempts >= KAFKA.MAX_PUBLISH_ATTEMPTS;
        const backoffMs = Math.min(60_000, 1000 * 2 ** attempts);
        await this.prisma.outboxEvent.update({
          where: { id: event.id },
          data: {
            attempts,
            status: failed ? "FAILED" : "PENDING",
            lastError: (err as Error).message.slice(0, 500),
            nextRetryAt: new Date(Date.now() + backoffMs),
          },
        });
        summary.failed++;
        this.logger.warn(
          `outbox.publish.failed {topic: "${event.topic}", eventId: "${event.eventId}", attempt: ${attempts}, status: "${failed ? "FAILED" : "PENDING"}", error: ${(err as Error).message.slice(0, 200)}}`,
        );
      }
    }
    if (summary.skippedHistorical > 0) {
      this.logger.log(`outbox.historical_hold {skipped: ${summary.skippedHistorical}, cutoff: "${this.historicalCutoff?.toISOString() ?? "none"}"}`);
    }
    return summary;
  }

  /** Aggregated counts for health/observability (no PII, no payloads). */
  async getPendingSummary(): Promise<OutboxPendingSummary> {
    const [pending, published, failed, byTopic] = await Promise.all([
      this.prisma.outboxEvent.count({ where: { status: "PENDING" } }),
      this.prisma.outboxEvent.count({ where: { status: "PUBLISHED" } }),
      this.prisma.outboxEvent.count({ where: { status: "FAILED" } }),
      this.prisma.outboxEvent.groupBy({ by: ["topic", "status"], _count: { _all: true } }),
    ]);
    return {
      pending,
      published,
      failed,
      byTopic: byTopic.map((g) => ({ topic: g.topic, status: g.status, count: g._count._all })),
    };
  }

  /** Historical cutoff in effect (null = no hold, but worker defaults hold all history). */
  getHistoricalCutoff(): Date | null {
    return this.historicalCutoff;
  }
}
