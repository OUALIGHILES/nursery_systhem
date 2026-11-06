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

@Injectable()
export class KafkaProducerService implements OnApplicationShutdown {
  private readonly logger = new Logger(KafkaProducerService.name);
  private readonly client: Kafka | null = null;
  private producer: Producer | null = null;
  private connecting: Promise<Producer | null> | null = null;

  constructor(private readonly config: ConfigService<Env, true>) {
    const brokers = config.get("KAFKA_BROKERS", { infer: true }).split(",").map((b) => b.trim()).filter(Boolean);
    if (brokers.length === 0) {
      this.logger.warn("KAFKA_BROKERS empty — Kafka producer disabled; events remain in outbox");
      return;
    }
    const ssl = config.get("KAFKA_SSL", { infer: true });
    const user = config.get("KAFKA_SASL_USERNAME", { infer: true });
    const pass = config.get("KAFKA_SASL_PASSWORD", { infer: true });
    this.client = new Kafka({
      clientId: config.get("KAFKA_CLIENT_ID", { infer: true }),
      brokers,
      ssl,
      ...(user && pass ? { sasl: { mechanism: "plain" as const, username: user, password: pass } } : {}),
      retry: { retries: 5, initialRetryTime: 300, factor: 2 },
    });
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
          this.logger.log("Kafka producer connected");
          return producer;
        })
        .catch((err: Error) => {
          this.logger.error(`Kafka producer connect failed: ${err.message}`);
          this.connecting = null;
          return null;
        });
    }
    return this.connecting;
  }

  async publish(topic: string, eventId: string, payload: unknown, key?: string): Promise<boolean> {
    const producer = await this.getProducer();
    if (!producer) return false;
    await producer.send({
      topic,
      messages: [{ key: key ?? eventId, value: JSON.stringify({ eventId, topic, occurredAt: new Date().toISOString(), payload }) }],
    });
    return true;
  }

  async onApplicationShutdown() {
    if (this.producer) {
      await this.producer.disconnect().catch(() => undefined);
      this.producer = null;
    }
  }
}

@Global()
@Module({
  providers: [KafkaProducerService],
  exports: [KafkaProducerService],
})
export class KafkaModule {}
