import {
  Global,
  Injectable,
  Logger,
  Module,
  OnApplicationShutdown,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Kafka, type Producer } from "kafkajs";
import type { Env } from "../config/env.js";

/**
 * Kafka producer with broker-unavailable tolerance: publish() returns
 * false (no throw) when the broker is down, so API startup never crashes
 * and outbox events stay PENDING for retry.
 */
@Injectable()
export class KafkaProducerService implements OnApplicationShutdown {
  private readonly logger = new Logger(KafkaProducerService.name);
  private readonly client: Kafka | null = null;
  private readonly brokerCount: number;
  private producer: Producer | null = null;
  private connecting: Promise<Producer | null> | null = null;

  constructor(private readonly config: ConfigService<Env, true>) {
    const brokers = config.get("KAFKA_BROKERS", { infer: true }).split(",").map((b) => b.trim()).filter(Boolean);
    this.brokerCount = brokers.length;
    if (brokers.length === 0) {
      this.logger.warn("KAFKA_BROKERS empty — Kafka producer disabled; events remain in outbox");
      return;
    }
    const ssl = config.get("KAFKA_SSL", { infer: true });
    const user = config.get("KAFKA_SASL_USERNAME", { infer: true });
    const pass = config.get("KAFKA_SASL_PASSWORD", { infer: true });
    const requestTimeout = config.get("KAFKA_REQUEST_TIMEOUT_MS", { infer: true });
    this.client = new Kafka({
      clientId: config.get("KAFKA_CLIENT_ID", { infer: true }),
      brokers,
      ssl,
      ...(user && pass ? { sasl: { mechanism: "plain" as const, username: user, password: pass } } : {}),
      requestTimeout,
      retry: { retries: 5, initialRetryTime: 300, factor: 2 },
    });
  }

  /** True when brokers are configured (regardless of live connectivity). */
  get isConfigured(): boolean {
    return this.client !== null;
  }

  /** True when a producer connection is already established. */
  get isConnected(): boolean {
    return this.producer !== null;
  }

  get brokersConfigured(): number {
    return this.brokerCount;
  }

  private async getProducer(): Promise<Producer | null> {
    if (!this.client) return null;
    if (this.producer) return this.producer;
    if (!this.connecting) {
      const producer = this.client.producer({ allowAutoTopicCreation: false, idempotent: true, maxInFlightRequests: 1 });
      this.connecting = producer
        .connect()
        .then(() => {
          this.producer = producer;
          this.logger.log("kafka.producer.connected {connected: true}");
          return producer;
        })
        .catch((err: Error) => {
          this.logger.warn(`kafka.producer.connect_failed {connected: false, error: ${err.message.slice(0, 200)}}`);
          this.connecting = null;
          return null;
        });
    }
    return this.connecting;
  }

  /**
   * Attempt to connect without publishing. Used by health/verification.
   * Never throws; returns false when the broker is unavailable.
   */
  async ping(): Promise<boolean> {
    const producer = await this.getProducer().catch(() => null);
    return producer !== null;
  }

  /**
   * Publish one event. Returns false when the producer is unavailable;
   * the OutboxService treats false as "retry later" (does not mark
   * PUBLISHED), preserving at-least-once + consumer dedupe.
   */
  async publish(topic: string, eventId: string, payload: unknown, key?: string): Promise<boolean> {
    const producer = await this.getProducer();
    if (!producer) return false;
    try {
      const result = await producer.send({
        topic,
        messages: [{ key: key ?? eventId, value: JSON.stringify({ eventId, topic, occurredAt: new Date().toISOString(), payload }) }],
      });
      const ok = result.length > 0;
      if (!ok) this.logger.warn(`kafka.producer.publish_failed {topic: "${topic}", eventId: "${eventId}", reason: "empty-result"}`);
      return ok;
    } catch (err) {
      this.logger.warn(`kafka.producer.publish_failed {topic: "${topic}", eventId: "${eventId}", error: ${(err as Error).message.slice(0, 200)}}`);
      // Drop the cached producer so the next tick retries a fresh connect.
      this.producer = null;
      this.connecting = null;
      return false;
    }
  }

  async onApplicationShutdown() {
    if (this.producer) {
      await this.producer.disconnect().catch(() => undefined);
      this.producer = null;
      this.connecting = null;
      this.logger.log("kafka.producer.disconnected {connected: false}");
    }
  }
}

@Global()
@Module({
  providers: [KafkaProducerService],
  exports: [KafkaProducerService],
})
export class KafkaModule {}
