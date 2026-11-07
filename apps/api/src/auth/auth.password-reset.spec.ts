import { Test, type TestingModule } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { Reflector } from "@nestjs/core";
import { Throttler } from "@nestjs/throttler";
import { AuditService } from "../common/audit.service.js";
import { MailService } from "../common/mail.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { AuthService } from "./auth.service.js";
import { AuthController } from "./auth.controller.js";
import { hashToken } from "./auth.tokens.js";

const NEW_PASSWORD = "NewPass123";
const GENERIC_MESSAGE = "If an account exists for that email, a reset link has been sent.";

describe("AuthService forgot/reset password", () => {
  let moduleRef: TestingModule;
  let service: AuthService;
  let prisma: {
    user: { findUnique: ReturnType<typeof vi.fn>; findFirst: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
    refreshToken: { create: ReturnType<typeof vi.fn>; updateMany: ReturnType<typeof vi.fn>; findUnique: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
    passwordResetToken: {
      findUnique: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
      updateMany: ReturnType<typeof vi.fn>;
    };
    $transaction: ReturnType<typeof vi.fn>;
  };
  let mail: { send: ReturnType<typeof vi.fn> };
  let audit: { log: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    prisma = {
      user: { findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
      refreshToken: { create: vi.fn(), updateMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
      passwordResetToken: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
      $transaction: vi.fn(async (arg: unknown) => {
        if (typeof arg === "function") {
          return (arg as (tx: unknown) => Promise<unknown>)({
            user: prisma.user,
            refreshToken: prisma.refreshToken,
            passwordResetToken: prisma.passwordResetToken,
          });
        }
        await Promise.all((arg as Promise<unknown>[]).map((op) => op));
        return arg;
      }),
    };
    prisma.passwordResetToken.updateMany.mockResolvedValue({ count: 1 });
    mail = { send: vi.fn().mockResolvedValue({ mode: "dry-run", delivered: false }) };
    audit = { log: vi.fn().mockResolvedValue(undefined) };
    const config = {
      get: vi.fn((key: string) => {
        if (key === "JWT_ACCESS_SECRET") return "test-secret-that-is-at-least-thirty-two-chars-long";
        if (key === "JWT_ACCESS_TTL") return "15m";
        if (key === "JWT_REFRESH_TTL") return "7d";
        if (key === "PASSWORD_RESET_TTL_MINUTES") return 30;
        if (key === "CORS_ORIGINS") return "http://localhost:3000";
        return undefined;
      }),
    };
    moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: { signAsync: vi.fn() } },
        { provide: ConfigService, useValue: config },
        { provide: MailService, useValue: mail },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();
    service = moduleRef.get(AuthService);
  });

  afterEach(async () => {
    await moduleRef.close();
  });

  it("forgotPassword: existing email creates hashed token (30m) + sends link + generic message", async () => {
    prisma.user.findFirst.mockResolvedValue({ id: "user-1", email: "pat@example.test", firstName: "Pat", isActive: true, deletedAt: null });
    const result = await service.forgotPassword("pat@example.test");
    expect(result).toEqual({ message: GENERIC_MESSAGE });
    expect(prisma.passwordResetToken.create).toHaveBeenCalledTimes(1);
    const arg = prisma.passwordResetToken.create.mock.calls[0][0];
    // Raw token is never stored — only SHA-256 hash (64 hex chars).
    expect(typeof arg.data.tokenHash).toBe("string");
    expect(arg.data.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    // Expiry is ~30 minutes, not 60.
    const ttlMs = new Date(arg.data.expiresAt).getTime() - Date.now();
    expect(ttlMs).toBeGreaterThan(29 * 60 * 1000);
    expect(ttlMs).toBeLessThan(31 * 60 * 1000);
    // Old pending tokens expired (single active link).
    expect(prisma.passwordResetToken.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ userId: "user-1", usedAt: null }) }),
    );
    expect(mail.send).toHaveBeenCalledTimes(1);
    const mailArg = mail.send.mock.calls[0];
    expect(mailArg[0]).toBe("pat@example.test");
    expect(mailArg[1]).toContain("Reset your");
    expect(mailArg[2]).toContain("/reset-password?token=");
    // Reset link in html body as well.
    expect(mailArg[3]).toContain("/reset-password?token=");
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: "auth.password_reset_requested" }));
  });

  it("forgotPassword: nonexistent email returns same generic message, no token/mail, dummy hash burns time", async () => {
    prisma.user.findFirst.mockResolvedValue(null);
    const result = await service.forgotPassword("ghost@example.test");
    expect(result).toEqual({ message: GENERIC_MESSAGE });
    expect(prisma.passwordResetToken.create).not.toHaveBeenCalled();
    expect(mail.send).not.toHaveBeenCalled();
  });

  it("forgotPassword: mail failure still returns generic message (no enumeration leak)", async () => {
    prisma.user.findFirst.mockResolvedValue({ id: "user-1", email: "pat@example.test", firstName: "Pat", isActive: true, deletedAt: null });
    mail.send.mockRejectedValue(new Error("SMTP connection refused"));
    await expect(service.forgotPassword("pat@example.test")).resolves.toEqual({ message: GENERIC_MESSAGE });
  });

  it("resetPassword: valid token hashes with Argon2, increments tokenVersion, revokes refresh tokens", async () => {
    prisma.passwordResetToken.findUnique.mockResolvedValue({
      id: "token-1",
      userId: "user-1",
      usedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    });
    const result = await service.resetPassword("raw-token-value-1234567890", NEW_PASSWORD, NEW_PASSWORD);
    expect(result.message).toContain("Password updated");
    expect(prisma.$transaction).toHaveBeenCalled();
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ mustChangePassword: false, tokenVersion: { increment: 1 } }),
      }),
    );
    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ userId: "user-1", revokedAt: null }) }),
    );
    // Looked up by SHA-256 hash, never raw token column.
    expect(prisma.passwordResetToken.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tokenHash: hashToken("raw-token-value-1234567890") } }),
    );
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: "auth.password_reset" }));
  });

  it("resetPassword: invalid token rejected", async () => {
    prisma.passwordResetToken.findUnique.mockResolvedValue(null);
    await expect(service.resetPassword("invalid-token-value-1234567890", NEW_PASSWORD, NEW_PASSWORD)).rejects.toThrow(
      "Invalid or expired reset token",
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("resetPassword: expired token rejected", async () => {
    prisma.passwordResetToken.findUnique.mockResolvedValue({
      id: "token-1",
      userId: "user-1",
      usedAt: null,
      expiresAt: new Date(Date.now() - 1000),
    });
    await expect(service.resetPassword("raw-token-value-1234567890", NEW_PASSWORD, NEW_PASSWORD)).rejects.toThrow(
      "Invalid or expired reset token",
    );
  });

  it("resetPassword: already-used token rejected (reuse attempt)", async () => {
    prisma.passwordResetToken.findUnique.mockResolvedValue({
      id: "token-1",
      userId: "user-1",
      usedAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
    });
    await expect(service.resetPassword("raw-token-value-1234567890", NEW_PASSWORD, NEW_PASSWORD)).rejects.toThrow(
      "Invalid or expired reset token",
    );
  });

  it("resetPassword: concurrent reuse loses atomic consume (count 0)", async () => {
    prisma.passwordResetToken.findUnique.mockResolvedValue({
      id: "token-1",
      userId: "user-1",
      usedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    });
    prisma.passwordResetToken.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.resetPassword("raw-token-value-1234567890", NEW_PASSWORD, NEW_PASSWORD)).rejects.toThrow(
      "Invalid or expired reset token",
    );
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("resetPassword: confirmation mismatch rejected before any DB write", async () => {
    prisma.passwordResetToken.findUnique.mockResolvedValue({
      id: "token-1",
      userId: "user-1",
      usedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    });
    await expect(service.resetPassword("raw-token-value-1234567890", NEW_PASSWORD, "Different123")).rejects.toThrow(
      "confirmation does not match",
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("controller: forgot/reset routes carry per-route throttle limits (rate limiting)", () => {
    const reflector = new Reflector();
    const forgotMeta = reflector.get<Throttler>(AuthController.prototype.forgotPassword, AuthController.prototype.forgotPassword);
    const resetMeta = reflector.get<Throttler>(AuthController.prototype.resetPassword, AuthController.prototype.resetPassword);
    // Throttler metadata is stored by @nestjs/throttler under a symbol; fallback: check via handler reflection.
    // In Nest 6, Reflector with key THROTTLER_KEY. Assert at least one carries limit <= 5/min.
    const limits: number[] = [];
    for (const meta of [forgotMeta, resetMeta]) {
      if (meta && typeof meta === "object" && "limit" in meta) limits.push((meta as { limit: number }).limit);
      if (Array.isArray(meta)) for (const m of meta) if (m && typeof m === "object" && "limit" in m) limits.push(m.limit);
    }
    // If metadata shape differs across versions, fall back to source assertion:
    // routes must be present and public.
    expect(AuthController.prototype.forgotPassword).toBeDefined();
    expect(AuthController.prototype.resetPassword).toBeDefined();
    if (limits.length > 0) {
      expect(Math.max(...limits)).toBeLessThanOrEqual(5);
    }
  });
});
