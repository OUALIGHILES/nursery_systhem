import { Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../prisma/prisma.service.js";
import { MailService } from "../common/mail.service.js";
import { EmailEventConsumer } from "./consumers.js";
import type { Env } from "../config/env.js";

function makeConfig() {
  return {
    get: (key: string) => {
      if (key === "KAFKA_BROKERS") return "localhost:9092";
      if (key === "KAFKA_CLIENT_ID") return "test-client";
      if (key === "KAFKA_SSL") return false;
      if (key === "KAFKA_SASL_USERNAME") return "";
      if (key === "KAFKA_SASL_PASSWORD") return "";
      if (key === "KAFKA_REQUEST_TIMEOUT_MS") return 10000;
      return undefined;
    },
  } as unknown as ConfigService<Env, true>;
}

describe("EmailEventConsumer", () => {
  beforeEach(() => {
    vi.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
    vi.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function build(mailSend: ReturnType<typeof vi.fn>) {
    const prisma = { user: { findUnique: vi.fn() } } as unknown as PrismaService;
    const mail = { send: mailSend } as unknown as MailService;
    return new EmailEventConsumer(makeConfig(), prisma as never, mail as never);
  }

  async function handle(consumer: EmailEventConsumer, topic: string, payload: Record<string, unknown>) {
    // Access the protected handle via any-cast for unit tests.
    await (consumer as unknown as { handle: (e: unknown) => Promise<void> }).handle({
      eventId: `evt-${Math.random().toString(36).slice(2)}`,
      topic,
      payload,
    });
  }

  it("sends enrollment.approved via MailService (dry-run mode still calls send but delivered=false)", async () => {
    const send = vi.fn().mockResolvedValue({ mode: "dry-run", delivered: false });
    const consumer = build(send);
    await handle(consumer, "enrollment.approved", {
      parentEmail: "pat@example.test",
      parentName: "Pat Parent",
      childName: "Casey Kid",
      reference: "LS-TEST",
      program: "TODDLERS",
    });
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][1]).toContain("approved");
  });

  it("reports sent mode when SMTP is live", async () => {
    const send = vi.fn().mockResolvedValue({ mode: "sent", delivered: true });
    const consumer = build(send);
    await handle(consumer, "enrollment.approved", {
      parentEmail: "pat@example.test",
      parentName: "Pat Parent",
      childName: "Casey Kid",
      reference: "LS-TEST",
      program: "TODDLERS",
    });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("skips when recipient is missing (no send call)", async () => {
    const send = vi.fn();
    const consumer = build(send);
    await handle(consumer, "enrollment.approved", { reference: "LS-TEST" });
    expect(send).not.toHaveBeenCalled();
  });

  it("sends rejection and notification.requested topics", async () => {
    const send = vi.fn().mockResolvedValue({ mode: "sent", delivered: true });
    const consumer = build(send);
    await handle(consumer, "enrollment.rejected", {
      parentEmail: "pat@example.test",
      parentName: "Pat",
      childName: "Kid",
      reference: "LS-TEST",
      adminNotes: "full",
    });
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][1]).toContain("Update");

    await handle(consumer, "notification.requested", {
      email: "pat@example.test",
      title: "Hi",
      body: "Hello",
    });
    expect(send).toHaveBeenCalledTimes(2);
  });
});
