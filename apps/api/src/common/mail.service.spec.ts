import { Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { redactForLog, MailService } from "./mail.service.js";

vi.mock("nodemailer", () => ({
  default: {
    createTransport: vi.fn(),
  },
}));

import nodemailer from "nodemailer";

const createTransportMock = nodemailer.createTransport as unknown as ReturnType<typeof vi.fn>;

function makeConfig(overrides: Record<string, unknown> = {}) {
  return {
    get: (key: string) => {
      if (key === "SMTP_FROM") return overrides.SMTP_FROM ?? "Little Steps Nursery <nursery@example.test>";
      if (key === "SMTP_HOST") return overrides.SMTP_HOST ?? "";
      if (key === "SMTP_PORT") return overrides.SMTP_PORT ?? 587;
      if (key === "SMTP_USER") return overrides.SMTP_USER ?? "";
      if (key === "SMTP_PASSWORD") return overrides.SMTP_PASSWORD ?? "test-only-value";
      if (key === "SMTP_SECURE") return overrides.SMTP_SECURE ?? false;
      if (key === "SMTP_VERIFY_ON_STARTUP") return overrides.SMTP_VERIFY_ON_STARTUP ?? false;
      if (key === "NODE_ENV") return overrides.NODE_ENV ?? "test";
      return undefined;
    },
  } as unknown as ConfigService;
}

describe("redactForLog", () => {
  it("redacts temporary passwords", () => {
    const redacted = redactForLog("Hello\nTemporary password: super-secret-123\nPlease sign in");
    expect(redacted).toContain("[REDACTED]");
    expect(redacted).not.toContain("super-secret-123");
  });

  it("redacts reset tokens in URLs", () => {
    const redacted = redactForLog("Reset: http://localhost:3000/reset-password?token=abc123raw");
    expect(redacted).not.toContain("abc123raw");
    expect(redacted).toContain("[REDACTED]");
  });

  it("preserves non-sensitive body text", () => {
    expect(redactForLog("Welcome to Little Steps")).toBe("Welcome to Little Steps");
  });
});

describe("MailService dry-run logging", () => {
  beforeEach(() => {
    createTransportMock.mockReset();
  });

  it("never logs a temporary password when SMTP is not configured", async () => {
    const config = makeConfig({ SMTP_HOST: "" });
    const service = new MailService(config);
    const logSpy = vi.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
    const warnSpy = vi.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);

    const result = await service.send(
      "pat@example.test",
      "Your Little Steps Nursery parent portal account",
      "Hello Pat\nTemporary password: super-secret-123\nPlease sign in and change it immediately.",
    );

    expect(result).toEqual({ mode: "dry-run", delivered: false });
    expect(service.isDryRun).toBe(true);
    expect(createTransportMock).not.toHaveBeenCalled();
    const logged = [...logSpy.mock.calls, ...warnSpy.mock.calls].map((call) => String(call[0])).join("\n");
    expect(logged).not.toContain("super-secret-123");
    expect(logged).toContain("[REDACTED]");
    logSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it("verifyConnection in dry-run reports ok:false without attempting SMTP", async () => {
    const service = new MailService(makeConfig({ SMTP_HOST: "" }));
    const result = await service.verifyConnection();
    expect(result.mode).toBe("dry-run");
    expect(result.ok).toBe(false);
    expect(createTransportMock).not.toHaveBeenCalled();
  });

  it("does not report delivery when only logged (dry-run delivered flag is false)", async () => {
    const service = new MailService(makeConfig({ SMTP_HOST: "" }));
    const result = await service.sendTestEmail("pat@example.test");
    expect(result.mode).toBe("dry-run");
    expect(result.delivered).toBe(false);
  });
});

describe("MailService live (SMTP configured) behavior", () => {
  beforeEach(() => {
    createTransportMock.mockReset();
    vi.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
    vi.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("creates a transporter and reports delivered:" + "true on sendMail success", async () => {
    const sendMail = vi.fn().mockResolvedValue({ messageId: "test-id" });
    createTransportMock.mockReturnValue({ sendMail, verify: vi.fn().mockResolvedValue(true) });
    const service = new MailService(makeConfig({ SMTP_HOST: "smtp.example.test", SMTP_PORT: 587 }));
    expect(service.isDryRun).toBe(false);
    expect(createTransportMock).toHaveBeenCalledWith(expect.objectContaining({ host: "smtp.example.test", port: 587 }));
    const result = await service.send("pat@example.test", "Hi", "Hello");
    expect(result).toEqual({ mode: "sent", delivered: true });
    expect(sendMail).toHaveBeenCalledTimes(1);
    // ensure no credentials leaked into sendMail args beyond transport config
    const args = JSON.stringify(sendMail.mock.calls[0][0]);
    expect(args).not.toContain("test-only-value");
  });

  it("verifyConnection succeeds when transporter.verify resolves", async () => {
    createTransportMock.mockReturnValue({ sendMail: vi.fn().mockResolvedValue({}), verify: vi.fn().mockResolvedValue(true) });
    const service = new MailService(makeConfig({ SMTP_HOST: "smtp.example.test" }));
    const result = await service.verifyConnection();
    expect(result).toEqual({ mode: "live", ok: true });
  });

  it("connection failure (sendMail rejects) propagates and is logged without secrets", async () => {
    const sendMail = vi.fn().mockRejectedValue(new Error("Connection refused"));
    createTransportMock.mockReturnValue({ sendMail, verify: vi.fn().mockRejectedValue(new Error("Connection refused")) });
    const service = new MailService(makeConfig({ SMTP_HOST: "smtp.example.test", SMTP_USER: "test-user" }));
    const errorSpy = vi.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
    await expect(service.send("pat@example.test", "Hi", "Hello")).rejects.toThrow("Connection refused");
    const logged = errorSpy.mock.calls.map((c) => String(c[0])).join("\n");
    expect(logged).not.toContain("test-only-value");
    expect(logged).toContain("mail.failed");
  });

  it("verify failure returns ok:false and does not throw", async () => {
    createTransportMock.mockReturnValue({ sendMail: vi.fn().mockResolvedValue({}), verify: vi.fn().mockRejectedValue(new Error("auth failed")) });
    const service = new MailService(makeConfig({ SMTP_HOST: "smtp.example.test", SMTP_USER: "test-user" }));
    const result = await service.verifyConnection();
    expect(result.ok).toBe(false);
    expect(result.mode).toBe("live");
  });

  it("onModuleInit is safe when verify fails", async () => {
    createTransportMock.mockReturnValue({ sendMail: vi.fn().mockResolvedValue({}), verify: vi.fn().mockRejectedValue(new Error("down")) });
    const service = new MailService(
      makeConfig({ SMTP_HOST: "smtp.example.test", SMTP_VERIFY_ON_STARTUP: true }),
    );
    await expect(service.onModuleInit()).resolves.not.toThrow();
  });
});
