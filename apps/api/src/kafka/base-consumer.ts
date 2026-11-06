import { Injectable, Logger, OnApplicationShutdown } from "@nestjs/common";
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
 * Base class for idempotent consumers with bounded retry + DLQ.
 *
 * Delivery is at-least-once; handlers must tolerate duplicates.
 * We dedupe via the ProcessedEvent table (unique eventId). The
 * `start()`/`stop()` lifecycle is idempotent (second start is a no-op,
 * stop is safe when never started), so the WorkerService can retry
 * startup without creating duplicate consumer instances.
 */
@Injectable()
export abstract class BaseEventConsumer implements OnApplicationShutdown {
  protected readonly logger = new Logger(this.constructor.name);
  private consumer: Consumer | null = null;
  private started = false;

  protected constructor(
    protected readonly config: ConfigService<Env, true>,
    protected readonly prisma: PrismaService,
  ) {}

  protected abstract readonly groupId: string;
  protected abstract readonly topics: string[];
  protected abstract handle(event: ConsumedEvent): Promise<void>;

  get isRunning(): boolean {
    return this.started && this.consumer !== null;
  }

  get consumerGroup(): string {
    return this.groupId;
  }

  get subscribedTopics(): string[] {
    return [...this.topics];
  }

  async start(): Promise<void> {
    if (this.started && this.consumer) {
      this.logger.log(`consumer.already_running {group: "${this.groupId}"}`);
      return;
    }
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
      requestTimeout: this.config.get("KAFKA_REQUEST_TIMEOUT_MS", { infer: true }),
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
    this.started = true;
    this.logger.log(`consumer.started {group: "${this.groupId}", topics: "${this.topics.join(",")}"}`);
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
      const message = (err as Error).message;
      this.logger.error(`consumer.processing.error {topic: "${topic}", reason: "unparseable", error: ${message.slice(0, 200)}}`);
      await this.toDlq(kafka, topic, raw, message);
      await commit();
      return;
    }

    const seen = await this.prisma.processedEvent.findUnique({ where: { eventId: event.eventId } });
    if (seen) {
      this.logger.log(`consumer.deduped {topic: "${topic}", eventId: "${event.eventId}", group: "${this.groupId}"}`);
      await commit();
      return;
    }

    let lastError: Error | null = null;
    for (let attempt = 1; attempt <= KAFKA.MAX_CONSUME_RETRIES; attempt++) {
      try {
        await this.handle(event);
        lastError = null;
        this.logger.log(`consumer.processed {topic: "${topic}", eventId: "${event.eventId}", group: "${this.groupId}", attempt: ${attempt}}`);
        break;
      } catch (err) {
        lastError = err as Error;
        this.logger.warn(
          `consumer.processing.error {topic: "${topic}", eventId: "${event.eventId}", group: "${this.groupId}", attempt: ${attempt}/${KAFKA.MAX_CONSUME_RETRIES}, error: ${lastError.message.slice(0, 200)}}`,
        );
        await new Promise((r) => setTimeout(r, 250 * 2 ** attempt));
      }
    }

    if (lastError) {
      this.logger.error(`consumer.processing.failed {topic: "${topic}", eventId: "${event.eventId}", group: "${this.groupId}", error: ${lastError.message.slice(0, 200)}}`);
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
        messages: [{ value: JSON.stringify({ originalTopic: topic, error, raw: raw.slice(0, 2000), failedAt: new Date().toISOString() }) }],
      });
      await producer.disconnect();
      this.logger.warn(`consumer.dlq {topic: "${topic}.dlq", error: ${error.slice(0, 200)}}`);
    } catch (err) {
      this.logger.error(`DLQ publish failed for ${topic}: ${(err as Error).message}`);
    }
  }

  async stop(): Promise<void> {
    if (this.consumer) {
      await this.consumer.disconnect().catch(() => undefined);
      this.consumer = null;
      this.logger.log(`consumer.stopped {group: "${this.groupId}"}`);
    }
    this.started = false;
  }

  async onApplicationShutdown(): Promise<void> {
    await this.stop();
  }
}
