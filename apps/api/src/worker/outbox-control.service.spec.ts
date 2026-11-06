import { Logger } from "@nestjs/common";
import { OutboxControlService } from "./outbox-control.service.js";
import type { PrismaService } from "../prisma/prisma.service.js";
import type { AuditService } from "../common/audit.service.js";
import type { OutboxService } from "../kafka/outbox.service.js";

describe("OutboxControlService — historical backlog safety", () => {
  beforeEach(() => {
    vi.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
    vi.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function build(prismaOverrides: Record<string, unknown> = {}) {
    const prisma = {
      outboxEvent: {
        findMany: vi.fn().mockResolvedValue([]),
        findUnique: vi.fn(),
        update: vi.fn().mockResolvedValue({}),
      },
      ...prismaOverrides,
    } as unknown as PrismaService;
    const audit = { log: vi.fn().mockResolvedValue(undefined) } as unknown as AuditService;
    const outbox = { getPendingSummary: vi.fn().mockResolvedValue({ pending: 2, published: 0, failed: 0, byTopic: [] }) } as unknown as OutboxService;
    return { service: new OutboxControlService(prisma as never, audit as never, outbox as never), prisma, audit, outbox };
  }

  it("listPending is read-only and returns metadata without payloads", async () => {
    const { service, prisma } = build();
    (prisma.outboxEvent.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: "1", eventId: "e1", topic: "enrollment.approved", status: "PENDING", attempts: 0, lastError: null, nextRetryAt: new Date(), createdAt: new Date(), publishedAt: null },
    ]);
    const rows = await service.listPending(10);
    expect(rows).toHaveLength(1);
    expect(rows[0]).not.toHaveProperty("payload");
    expect(prisma.outboxEvent.update).not.toHaveBeenCalled();
  });

  it("skipHistorical marks FAILED (never publishes) and audits", async () => {
    const { service, prisma, audit } = build();
    (prisma.outboxEvent.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "1", eventId: "e-hist", topic: "enrollment.approved", status: "PENDING", attempts: 0,
    });
    const result = await service.skipHistorical("e-hist", "duplicate approval — children already notified manually", "admin-1");
    expect(result.skipped).toBe(true);
    const update = (prisma.outboxEvent.update as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(update.data.status).toBe("FAILED");
    expect(update.data.lastError).toContain("Skipped by admin");
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: "outbox.historical_skipped", actorId: "admin-1" }));
  });

  it("releaseSingle resets nextRetryAt only (relay will publish once)", async () => {
    const { service, prisma, audit } = build();
    (prisma.outboxEvent.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "1", eventId: "e-hist", topic: "enrollment.approved", status: "PENDING",
    });
    const result = await service.releaseSingle("e-hist", "admin-1");
    expect(result.released).toBe(true);
    const update = (prisma.outboxEvent.update as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(update.data.status).toBeUndefined(); // stays PENDING
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: "outbox.historical_released" }));
  });

  it("skip/release on non-PENDING rows are no-ops (idempotent)", async () => {
    const { service, prisma } = build();
    (prisma.outboxEvent.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "1", eventId: "e-done", topic: "enrollment.approved", status: "PUBLISHED",
    });
    const skipped = await service.skipHistorical("e-done", "too late", "admin-1");
    expect(skipped.skipped).toBe(false);
    const released = await service.releaseSingle("e-done", "admin-1");
    expect(released.released).toBe(false);
    expect(prisma.outboxEvent.update).not.toHaveBeenCalled();
  });

  it("throws NotFoundException for unknown eventId", async () => {
    const { service, prisma } = build();
    (prisma.outboxEvent.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    await expect(service.skipHistorical("missing", "reason", "admin-1")).rejects.toThrow("Outbox event not found");
  });
});
