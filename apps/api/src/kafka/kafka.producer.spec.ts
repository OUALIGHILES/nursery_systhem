import { Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { KafkaProducerService } from "./kafka.producer.js";
import type { Env } from "../config/env.js";

vi.mock("kafkajs", () => ({
  Kafka: class MockKafka {
    producer() {
      // No connect(): kafkajs path is exercised as "unavailable" in tests.
      return {
        connect: () => Promise.reject(new Error("broker down")),
        send: vi.fn(),
        disconnect: () => Promise.resolve(),
      };
    }
  },
}));

function makeConfig(overrides: Record<string, unknown> = {}) {
  return {
    get: (key: string) => {
      if (key === "KAFKA_BROKERS") return overrides.KAFKA_BROKERS ?? "localhost:9092";
      if (key === "KAFKA_CLIENT_ID") return "test-client";
      if (key === "KAFKA_SSL") return false;
      if (key === "KAFKA_SASL_USERNAME") return "";
      if (key === "KAFKA_SASL_PASSWORD") return "";
      if (key === "KAFKA_REQUEST_TIMEOUT_MS") return 10000;
      return undefined;
    },
  } as unknown as ConfigService<Env, true>;
}

describe("KafkaProducerService", () => {
  beforeEach(() => {
    vi.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
    vi.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("is configured when brokers are set; unconfigured when empty", () => {
    expect(new KafkaProducerService(makeConfig()).isConfigured).toBe(true);
    expect(new KafkaProducerService(makeConfig({ KAFKA_BROKERS: "" })).isConfigured).toBe(false);
  });

  it("publish() returns false (no throw) when producer unavailable — API startup does not crash", async () => {
    const service = new KafkaProducerService(makeConfig());
    // The mocked Kafka constructor returns { producer: vi.fn() } without a connect
    // implementation, so getProducer will reject and service must return false.
    await expect(service.publish("enrollment.approved", "evt-1", { foo: "bar" })).resolves.toBe(false);
  });

  it("ping() and shutdown are safe when broker is down", async () => {
    const service = new KafkaProducerService(makeConfig());
    await expect(service.ping()).resolves.toBe(false);
    await expect(service.onApplicationShutdown()).resolves.not.toThrow();
  });

  it("isConnected starts false", () => {
    const service = new KafkaProducerService(makeConfig());
    expect(service.isConnected).toBe(false);
    expect(service.brokersConfigured).toBe(1);
  });
});
