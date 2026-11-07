import { Test, type TestingModule } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import argon2 from "argon2";
import { AuditService } from "../common/audit.service.js";
import { MailService } from "../common/mail.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { AuthService } from "./auth.service.js";

const TEMP_PASSWORD = "TempPass123";
const NEW_PASSWORD = "NewPass123";

describe("AuthService mandatory password change", () => {
  let moduleRef: TestingModule;
  let service: AuthService;
  let prisma: {
    user: { findUnique: ReturnType<typeof vi.fn>; findFirst: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
    refreshToken: { create: ReturnType<typeof vi.fn>; updateMany: ReturnType<typeof vi.fn>; findUnique: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
    passwordResetToken: { findUnique: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn>; updateMany: ReturnType<typeof vi.fn> };
    $transaction: ReturnType<typeof vi.fn>;
  };
  let jwt: { signAsync: ReturnType<typeof vi.fn> };
  let config: { get: ReturnType<typeof vi.fn> };
  let audit: { log: ReturnType<typeof vi.fn> };
  let mail: { send: ReturnType<typeof vi.fn> };
  let tempHash = "";

  beforeEach(async () => {
    tempHash = await argon2.hash(TEMP_PASSWORD, { type: argon2.argon2id });
    prisma = {
      user: { findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
      refreshToken: { create: vi.fn(), updateMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
      passwordResetToken: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
      $transaction: vi.fn(async (arg: unknown) => {
        if (typeof arg === "function") {
          // Interactive transaction (resetPassword): invoke callback with
          // a mock client backed by the same prisma spies.
          return (arg as (tx: unknown) => Promise<unknown>)({
            user: prisma.user,
            refreshToken: prisma.refreshToken,
            passwordResetToken: prisma.passwordResetToken,
          });
        }
        // Array transaction (changePassword / verifyEmail).
        await Promise.all((arg as Promise<unknown>[]).map((op) => op));
        return arg;
      }),
    };
    jwt = { signAsync: vi.fn().mockResolvedValue("access-token") };
    config = {
      get: vi.fn((key: string) => {
        if (key === "JWT_ACCESS_SECRET") return "test-secret-that-is-at-least-thirty-two-chars-long";
        if (key === "JWT_ACCESS_TTL") return "15m";
        if (key === "JWT_REFRESH_TTL") return "7d";
        if (key === "PASSWORD_RESET_TTL_MINUTES") return 30;
        if (key === "CORS_ORIGINS") return "http://localhost:3000";
        return undefined;
      }),
    };
    // Default single-use consume success; individual tests may override.
    prisma.passwordResetToken.updateMany.mockResolvedValue({ count: 1 });
    audit = { log: vi.fn().mockResolvedValue(undefined) };
    mail = { send: vi.fn().mockResolvedValue(undefined) };
    moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: jwt },
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

  function mockTempUser() {
    prisma.user.findUnique.mockResolvedValue({
      id: "user-1",
      email: "pat@example.test",
      passwordHash: tempHash,
      mustChangePassword: true,
      isActive: true,
      deletedAt: null,
    });
  }

  it("login returns mustChangePassword=true so the frontend can redirect to /change-password", async () => {
    prisma.user.findFirst.mockResolvedValue({
      id: "user-1",
      email: "pat@example.test",
      firstName: "Pat",
      lastName: "Parent",
      passwordHash: tempHash,
      isActive: true,
      deletedAt: null,
      mustChangePassword: true,
      role: { name: "PARENT" },
      parentProfile: { id: "parent-1" },
      staffProfile: null,
    });
    prisma.user.update.mockResolvedValue({});
    prisma.refreshToken.create.mockResolvedValue({});
    const result = await service.login("pat@example.test", TEMP_PASSWORD);
    expect(result.user.mustChangePassword).toBe(true);
    expect(result.tokens.accessToken).toBe("access-token");
  });

  it("changes password: sets mustChangePassword=false and revokes all refresh tokens", async () => {
    mockTempUser();
    const update = vi.fn().mockResolvedValue({});
    const revoke = vi.fn().mockResolvedValue({});
    prisma.$transaction.mockImplementation(async (ops: unknown[]) => {
      for (const op of ops) await op;
      return ops;
    });
    // The transaction array contains lazy Prisma promises; our mock resolves
    // them by awaiting each one. Silence unhandled rejections from mocks.
    const result = await service.changePassword("user-1", TEMP_PASSWORD, NEW_PASSWORD, NEW_PASSWORD);
    expect(result.message).toBe("Password changed. Please sign in again.");
    expect(prisma.$transaction).toHaveBeenCalled();
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: "auth.password_changed" }));
    void update;
    void revoke;
  });

  it("rejects when confirmation does not match (no DB write)", async () => {
    mockTempUser();
    await expect(
      service.changePassword("user-1", TEMP_PASSWORD, NEW_PASSWORD, "Different123"),
    ).rejects.toThrow("confirmation does not match");
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("rejects when new password equals the current password", async () => {
    mockTempUser();
    await expect(
      service.changePassword("user-1", TEMP_PASSWORD, TEMP_PASSWORD, TEMP_PASSWORD),
    ).rejects.toThrow("must differ from current password");
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("rejects a wrong current password", async () => {
    mockTempUser();
    await expect(
      service.changePassword("user-1", "WrongPass123", NEW_PASSWORD, NEW_PASSWORD),
    ).rejects.toThrow("Current password is incorrect");
  });

  it("old password no longer verifies after change and new password does", async () => {
    const newHash = await argon2.hash(NEW_PASSWORD, { type: argon2.argon2id });
    await expect(argon2.verify(newHash, NEW_PASSWORD)).resolves.toBe(true);
    await expect(argon2.verify(tempHash, NEW_PASSWORD)).resolves.toBe(false);
  });

  it("issues access tokens carrying the current tokenVersion (tv claim)", async () => {
    const user = {
      id: "user-1",
      email: "pat@example.test",
      firstName: "Pat",
      lastName: "Parent",
      passwordHash: tempHash,
      isActive: true,
      deletedAt: null,
      mustChangePassword: false,
      tokenVersion: 3,
      role: { name: "PARENT" },
      parentProfile: { id: "parent-1" },
      staffProfile: null,
    };
    const tokens = await service.issueTokenPair("user-1", "PARENT", {}, 3);
    void user;
    expect(jwt.signAsync).toHaveBeenCalledWith(
      expect.objectContaining({ sub: "user-1", tv: 3 }),
      expect.anything(),
    );
    expect(tokens.accessToken).toBe("access-token");
  });

  it("increments tokenVersion on password change so old access tokens are revoked", async () => {
    mockTempUser();
    await service.changePassword("user-1", TEMP_PASSWORD, NEW_PASSWORD, NEW_PASSWORD);
    // Prisma update is invoked while building the transaction array.
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ tokenVersion: { increment: 1 } }),
      }),
    );
  });

  it("password reset still clears mustChangePassword (regression)", async () => {
    prisma.passwordResetToken.findUnique.mockResolvedValue({
      id: "token-1",
      userId: "user-1",
      usedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    });
    const result = await service.resetPassword("raw-token-value-1234567890", NEW_PASSWORD);
    expect(result.message).toContain("Password updated");
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it("logout revokes the refresh token (regression)", async () => {
    prisma.refreshToken.updateMany.mockResolvedValue({});
    await service.logout("some-refresh-token");
    expect(prisma.refreshToken.updateMany).toHaveBeenCalled();
  });

  it("existing accounts with mustChangePassword=false keep working (publicUser flag passthrough)", async () => {
    const user = {
      id: "user-2",
      email: "admin@example.test",
      firstName: "Ada",
      lastName: "Admin",
      mustChangePassword: false,
      role: { name: "ADMIN" as const },
      parentProfile: null,
      staffProfile: { id: "staff-1" },
    };
    expect(service.publicUser(user).mustChangePassword).toBe(false);
  });
});
