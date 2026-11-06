import { Test, type TestingModule } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../prisma/prisma.service.js";
import { KafkaProducerService } from "./kafka.producer.js";
import { OutboxService } from "./outbox.service.js";

describe("OutboxService", () => {
  let moduleRef: TestingModule;
  let service: OutboxService;
  let prisma: {
    outboxEvent: {
      create: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
      count: ReturnType<typeof vi.fn>;
      groupBy: ReturnType<typeof vi.fn>;
    };
  };
  let kafka: { publish: ReturnType<typeof vi.fn> };

  function baseProviders(cutoffIso = "") {
    const config = {
      get: (key: string) => {
        if (key === "OUTBOX_HISTORICAL_CUTOFF_ISO") return cutoffIso;
        if (key === "OUTBOX_BATCH_SIZE") return 50;
        return undefined;
      },
    } as unknown as ConfigService;
    return [
      OutboxService,
      { provide: PrismaService, useValue: prisma },
      { provide: KafkaProducerService, useValue: kafka },
      { provide: ConfigService, useValue: config },
    ];
  }

  beforeEach(async () => {
    prisma = {
      outboxEvent: {
        create: vi.fn(),
        findMany: vi.fn(),
        update: vi.fn(),
        count: vi.fn(),
        groupBy: vi.fn(),
      },
    };
    kafka = { publish: vi.fn() };
    moduleRef = await Test.createTestingModule({
      providers: baseProviders(),
    }).compile();
    service = moduleRef.get(OutboxService);
  });

  afterEach(async () => {
    await moduleRef.close();
  });

  it("writes the outbox row through the supplied transaction client", async () => {
    const tx = { outboxEvent: { create: vi.fn().mockResolvedValue({}) } };
    const id = await service.enqueue("enrollment.approved", { id: "app-1" }, tx as never);
    expect(tx.outboxEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ topic: "enrollment.approved" }) }),
    );
    expect(id).toBeTruthy();
  });

  it("marks events PUBLISHED after a successful relay publish", async () => {
    const due = [{ id: "1", eventId: "e1", topic: "enrollment.approved", payload: {}, attempts: 0, createdAt: new Date() }];
    prisma.outboxEvent.findMany.mockResolvedValue(due);
    kafka.publish.mockResolvedValue(true);
    prisma.outboxEvent.update.mockResolvedValue({});
    const summary = await service.publishPending();
    expect(prisma.outboxEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "1" }, data: expect.objectContaining({ status: "PUBLISHED" }) }),
    );
    expect(summary).toMatchObject({ published: 1, failed: 0, attempted: 1 });
  });

  it("retries with backoff when the broker is unavailable and never marks PUBLISHED", async () => {
    const due = [{ id: "1", eventId: "e1", topic: "enrollment.approved", payload: {}, attempts: 0, createdAt: new Date() }];
    prisma.outboxEvent.findMany.mockResolvedValue(due);
    kafka.publish.mockResolvedValue(false);
    prisma.outboxEvent.update.mockResolvedValue({});
    await service.publishPending();
    const updateArg = prisma.outboxEvent.update.mock.calls[0][0];
    expect(updateArg.data.status).toBe("PENDING");
    expect(updateArg.data.attempts).toBe(1);
    expect(updateArg.data.lastError).toMatch(/unavailable/i);
  });

  it("marks FAILED after the maximum publish attempts", async () => {
    const due = [{ id: "1", eventId: "e1", topic: "enrollment.approved", payload: {}, attempts: 5, createdAt: new Date() }];
    prisma.outboxEvent.findMany.mockResolvedValue(due);
    kafka.publish.mockResolvedValue(false);
    prisma.outboxEvent.update.mockResolvedValue({});
    await service.publishPending();
    expect(prisma.outboxEvent.update.mock.calls[0][0].data.status).toBe("FAILED");
  });

  it("never auto-publishes historical PENDING events (backlog hold)", async () => {
    await moduleRef.close();
    moduleRef = await Test.createTestingModule({
      providers: baseProviders("2026-11-06T19:00:00.000Z"),
    }).compile();
    service = moduleRef.get(OutboxService);
    const historical = [
      { id: "1", eventId: "e-hist", topic: "enrollment.approved", payload: {}, attempts: 0, createdAt: new Date("2026-11-06T18:00:00.000Z") },
      { id: "2", eventId: "e-new", topic: "enrollment.approved", payload: {}, attempts: 0, createdAt: new Date("2026-11-07T00:00:00.000Z") },
    ];
    prisma.outboxEvent.findMany.mockResolvedValue(historical);
    kafka.publish.mockResolvedValue(true);
    prisma.outboxEvent.update.mockResolvedValue({});
    const summary = await service.publishPending();
    expect(summary.skippedHistorical).toBe(1);
    expect(summary.published).toBe(1);
    // Historical row was never attempted: update only for the new row.
    expect(prisma.outboxEvent.update).toHaveBeenCalledTimes(1);
    expect(prisma.outboxEvent.update.mock.calls[0][0].where.id).toBe("2");
    expect(kafka.publish).toHaveBeenCalledTimes(1);
  });

  it("getPendingSummary returns aggregate counts for health", async () => {
    prisma.outboxEvent.count.mockResolvedValueOnce(2).mockResolvedValueOnce(5).mockResolvedValueOnce(1);
    prisma.outboxEvent.groupBy.mockResolvedValue([
      { topic: "enrollment.approved", status: "PENDING", _count: { _all: 2 } },
    ]);
    const summary = await service.getPendingSummary();
    expect(summary.pending).toBe(2);
    expect(summary.published).toBe(5);
    expect(summary.failed).toBe(1);
    expect(summary.byTopic).toHaveLength(1);
  });
});
