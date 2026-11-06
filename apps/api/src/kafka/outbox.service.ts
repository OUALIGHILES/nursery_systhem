import { Injectable, Logger } from "@nestjs/common";
import { randomUUID } from "crypto";
import { PrismaService } from "../prisma/prisma.service.js";
import { KafkaProducerService } from "./kafka.producer.js";
import { KAFKA, type KafkaTopicName } from "./topics.js";
import type { Prisma } from "../generated/prisma/client.js";

type Tx = Prisma.TransactionClient;

/**
 * Transactional Outbox: business code writes the domain event to the
 * OutboxEvent table inside the same DB transaction as the state change.
 * A background relay publishes pending rows to Kafka and marks them
 * published, so events are never lost between DB commit and Kafka send.
 */
@Injectable()
export class OutboxService {
  private readonly logger = new Logger(OutboxService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly kafka: KafkaProducerService,
  ) {}

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

  /** Publish due pending events. Called by the worker relay on an interval. */
  async publishPending(batchSize = 50): Promise<void> {
    const due = await this.prisma.outboxEvent.findMany({
      where: { status: "PENDING", nextRetryAt: { lte: new Date() } },
      orderBy: { createdAt: "asc" },
      take: batchSize,
    });

    for (const event of due) {
      try {
        const ok = await this.kafka.publish(event.topic, event.eventId, event.payload);
        if (!ok) throw new Error("Kafka producer unavailable");
        await this.prisma.outboxEvent.update({
          where: { id: event.id },
          data: { status: "PUBLISHED", publishedAt: new Date(), lastError: null },
        });
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
        this.logger.warn(`Outbox publish failed (attempt ${attempts}) for ${event.topic}: ${(err as Error).message}`);
      }
    }
  }
}
