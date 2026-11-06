import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Kafka, type Consumer, type EachMessagePayload } from "kafkajs";
import { PrismaService } from "../prisma/prisma.service.js";
import type { Env } from "../config/env.js";
import { KAFKA } from "./topics.js";

export interface ConsumedEvent {
  eventId: string;
  topic: string;
  occurredAt?: string;
  payload: Record<string, unknown>;
}

/**
 * Base class for idempotent consumers with retry + DLQ.
 * Delivery is at-least-once; handlers must tolerate duplicates.
 * We dedupe via the ProcessedEvent table (unique eventId).
 */
@Injectable()
export abstract class BaseEventConsumer {
  protected readonly logger = new Logger(this.constructor.name);
  private consumer: Consumer | null = null;

  protected constructor(
    protected readonly config: ConfigService<Env, true>,
    protected readonly prisma: PrismaService,
  ) {}

  protected abstract readonly groupId: string;
  protected abstract readonly topics: string[];
  protected abstract handle(event: ConsumedEvent): Promise<void>;

  async start(): Promise<void> {
    const brokers = this.config.get("KAFKA_BROKERS", { infer: true }).split(",").map((b) => b.trim()).filter(Boolean);
    if (brokers.length === 0) {
      this.logger.warn("KAFKA_BROKERS empty — consumer not started");
      return;
    }
    const ssl = this.config.get("KAFKA_SSL", { infer: true });
    const user = this.config.get("KAFKA_SASL_USERNAME", { infer: true });
    const pass = this.config.get("KAFKA_SASL_PASSWORD", { infer: true });
    const kafka = new Kafka({
      clientId: `${this.config.get("KAFKA_CLIENT_ID", { infer: true })}-${this.groupId}`,
      brokers,
      ssl,
      ...(user && pass ? { sasl: { mechanism: "plain" as const, username: user, password: pass } } : {}),
      retry: { retries: 5, initialRetryTime: 300, factor: 2 },
    });
    this.consumer = kafka.consumer({ groupId: this.groupId, allowAutoTopicCreation: false });
    await this.consumer.connect();
    for (const topic of this.topics) {
      await this.consumer.subscribe({ topic, fromBeginning: false });
    }
    await this.consumer.run({
      autoCommit: false,
      eachMessage: async (payload) => this.processMessage(kafka, payload),
    });
    this.logger.log(`Subscribed to ${this.topics.join(", ")} as group ${this.groupId}`);
  }

  private async processMessage(kafka: Kafka, { topic, partition, message }: EachMessagePayload) {
    const offset = message.offset;
    const raw = message.value?.toString() ?? "";
    const commit = () =>
      this.consumer
        ?.commitOffsets([{ topic, partition, offset: (Number(offset) + 1).toString() }])
        .catch((err: Error) => this.logger.error(`Offset commit failed for ${topic}@${offset}: ${err.message}`));

    let event: ConsumedEvent;
    try {
      event = JSON.parse(raw) as ConsumedEvent;
      if (!event.eventId || !event.payload) throw new Error("Missing eventId or payload");
    } catch (err) {
      this.logger.error(`Unparseable message on ${topic}: ${(err as Error).message}`);
      await this.toDlq(kafka, topic, raw, (err as Error).message);
      await commit();
      return;
    }

    const seen = await this.prisma.processedEvent.findUnique({ where: { eventId: event.eventId } });
    if (seen) {
      await commit();
      return;
    }

    let lastError: Error | null = null;
    for (let attempt = 1; attempt <= KAFKA.MAX_CONSUME_RETRIES; attempt++) {
      try {
        await this.handle(event);
        lastError = null;
        break;
      } catch (err) {
        lastError = err as Error;
        this.logger.warn(`Handler failed (attempt ${attempt}/${KAFKA.MAX_CONSUME_RETRIES}) for ${event.eventId}: ${lastError.message}`);
        await new Promise((r) => setTimeout(r, 250 * 2 ** attempt));
      }
    }

    if (lastError) {
      await this.toDlq(kafka, topic, raw, lastError.message);
    }
    // Mark processed either way so a poison message is not retried forever; DLQ holds the failed copy.
    await this.prisma.processedEvent
      .create({ data: { eventId: event.eventId, consumerGroup: this.groupId } })
      .catch(() => undefined);
    await commit();
  }

  private async toDlq(kafka: Kafka, topic: string, raw: string, error: string) {
    try {
      const producer = kafka.producer();
      await producer.connect();
      await producer.send({
        topic: `${topic}${KAFKA.DLQ_SUFFIX}`,
        messages: [{ value: JSON.stringify({ originalTopic: topic, error, raw, failedAt: new Date().toISOString() }) }],
      });
      await producer.disconnect();
    } catch (err) {
      this.logger.error(`DLQ publish failed for ${topic}: ${(err as Error).message}`);
    }
  }

  async stop(): Promise<void> {
    await this.consumer?.disconnect().catch(() => undefined);
    this.consumer = null;
  }
}
