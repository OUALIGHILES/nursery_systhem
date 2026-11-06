import { Logger } from "@nestjs/common";
import { WorkerService } from "./worker.service.js";
import type {
  AuditEventConsumer,
  AttendanceEventConsumer,
  EmailEventConsumer,
  FinancialEventConsumer,
  NotificationEventConsumer,
} from "../kafka/consumers.js";

function mockConsumer(group: string) {
  return {
    consumerGroup: group,
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
  };
}

describe("WorkerService", () => {
  beforeEach(() => {
    vi.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
    vi.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
    vi.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function build(overrides: Record<string, ReturnType<typeof mockConsumer>> = {}) {
    const audit = overrides.audit ?? mockConsumer("audit");
    const notifications = overrides.notifications ?? mockConsumer("notifications");
    const email = overrides.email ?? mockConsumer("email");
    const attendance = overrides.attendance ?? mockConsumer("attendance");
    const financial = overrides.financial ?? mockConsumer("financial");
    const service = new WorkerService(
      audit as unknown as AuditEventConsumer,
      notifications as unknown as NotificationEventConsumer,
      email as unknown as EmailEventConsumer,
      attendance as unknown as AttendanceEventConsumer,
      financial as unknown as FinancialEventConsumer,
    );
    return { service, audit, notifications, email, attendance, financial };
  }

  it("starts every consumer exactly once (no duplicate instances)", async () => {
    const { service, audit, notifications, email, attendance, financial } = build();
    await service.onModuleInit();
    for (const c of [audit, notifications, email, attendance, financial]) {
      expect(c.start).toHaveBeenCalledTimes(1);
    }
  });

  it("Kafka unavailable during startup: gives up after bounded retries without throwing", async () => {
    const failing = mockConsumer("email");
    failing.start.mockRejectedValue(new Error("broker down"));
    const { service, audit } = build({ email: failing });
    await expect(service.onModuleInit()).resolves.not.toThrow();
    // Other consumers still started; failing consumer retried 5 times.
    expect(audit.start).toHaveBeenCalledTimes(1);
    expect(failing.start).toHaveBeenCalledTimes(5);
  }, 30_000);

  it("graceful shutdown stops every consumer", async () => {
    const { service, audit, notifications, email, attendance, financial } = build();
    await service.onModuleInit();
    await service.onApplicationShutdown();
    for (const c of [audit, notifications, email, attendance, financial]) {
      expect(c.stop).toHaveBeenCalledTimes(1);
    }
  });

  it("graceful shutdown is safe when start partially failed", async () => {
    const failing = mockConsumer("email");
    failing.start.mockRejectedValue(new Error("down"));
    const { service } = build({ email: failing });
    await service.onModuleInit();
    await expect(service.onApplicationShutdown()).resolves.not.toThrow();
    expect(failing.stop).toHaveBeenCalledTimes(1);
  }, 30_000);
});
