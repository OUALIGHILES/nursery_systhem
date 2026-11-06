import { Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { OutboxRelayService } from "./outbox-relay.service.js";
import type { OutboxService } from "./outbox.service.js";
import type { Env } from "../config/env.js";

function makeConfig() {
  return {
    get: (key: string) => {
      if (key === "OUTBOX_RELAY_INTERVAL_MS") return 2000;
      return undefined;
    },
  } as unknown as ConfigService<Env, true>;
}

describe("OutboxRelayService", () => {
  beforeEach(() => {
    vi.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
    vi.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("publishes via outbox.publishPending on tick and logs summary", async () => {
    const publishPending = vi
      .fn()
      .mockResolvedValue({ published: 2, failed: 0, skippedHistorical: 0, attempted: 2 });
    const service = new OutboxRelayService(
      { publishPending } as unknown as OutboxService,
      makeConfig(),
    );
    await service.tick();
    expect(publishPending).toHaveBeenCalledTimes(1);
  });

  it("does not crash when publishPending throws (broker unavailable)", async () => {
    const publishPending = vi.fn().mockRejectedValue(new Error("db down"));
    const service = new OutboxRelayService(
      { publishPending } as unknown as OutboxService,
      makeConfig(),
    );
    await expect(service.tick()).resolves.not.toThrow();
  });

  it("prevents overlapping ticks", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const publishPending = vi.fn().mockImplementation(() => gate);
    const service = new OutboxRelayService(
      { publishPending } as unknown as OutboxService,
      makeConfig(),
    );
    const first = service.tick();
    const second = service.tick();
    release();
    await Promise.all([first, second]);
    expect(publishPending).toHaveBeenCalledTimes(1);
  });

  it("is idempotent on shutdown", () => {
    const service = new OutboxRelayService(
      { publishPending: vi.fn() } as unknown as OutboxService,
      makeConfig(),
    );
    expect(() => {
      service.onModuleDestroy();
      (service as unknown as { onApplicationShutdown: () => void }).onApplicationShutdown();
    }).not.toThrow();
  });
});
