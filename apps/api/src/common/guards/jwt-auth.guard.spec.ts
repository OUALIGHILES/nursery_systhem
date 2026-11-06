import { ForbiddenException, UnauthorizedException } from "@nestjs/common";
import { IS_PUBLIC_KEY } from "../decorators/public.decorator.js";
import { PASSWORD_CHANGE_ALLOWED_KEY } from "../decorators/password-change-allowed.decorator.js";
import { JwtAuthGuard } from "./jwt-auth.guard.js";

function makeContext(isPublic: boolean, passwordChangeAllowed: boolean, token = "valid-token") {
  const request: Record<string, unknown> = {
    headers: token ? { authorization: `Bearer ${token}` } : {},
    cookies: {},
    user: undefined,
  };
  const reflector = {
    getAllAndOverride: (key: string) => {
      if (key === IS_PUBLIC_KEY) return isPublic;
      if (key === PASSWORD_CHANGE_ALLOWED_KEY) return passwordChangeAllowed;
      return undefined;
    },
  };
  const context = {
    getType: () => "http",
    getHandler: () => () => undefined,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => request }),
  };
  return { context: context as never, reflector, request };
}

describe("JwtAuthGuard mustChangePassword enforcement", () => {
  const secret = "test-secret-that-is-at-least-thirty-two-chars-long";
  let jwt: { verifyAsync: ReturnType<typeof vi.fn> };
  let config: { get: ReturnType<typeof vi.fn> };
  let prisma: { user: { findFirst: ReturnType<typeof vi.fn> } };

  beforeEach(() => {
    jwt = { verifyAsync: vi.fn().mockResolvedValue({ sub: "user-1" }) };
    config = { get: vi.fn().mockReturnValue(secret) };
    prisma = { user: { findFirst: vi.fn() } };
  });

  function buildGuard(reflector: unknown) {
    return new JwtAuthGuard(
      jwt as never,
      config as never,
      prisma as never,
      reflector as never,
    );
  }

  function mockUser(mustChangePassword: boolean, role = "PARENT", tokenVersion = 0) {
    prisma.user.findFirst.mockResolvedValue({
      id: "user-1",
      email: "parent@example.test",
      firstName: "Pat",
      lastName: "Parent",
      mustChangePassword,
      tokenVersion,
      role: { name: role },
      parentProfile: { id: "parent-1" },
      staffProfile: null,
    });
  }

  function mockPayload(tv: number | undefined) {
    jwt.verifyAsync.mockResolvedValue(tv === undefined ? { sub: "user-1" } : { sub: "user-1", tv });
  }

  it("allows public routes without a token", async () => {
    const { context, reflector } = makeContext(true, false, "");
    const guard = buildGuard(reflector);
    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it("rejects requests without a token", async () => {
    const { context, reflector } = makeContext(false, false, "");
    // getRequest headers empty -> token missing
    const guard = buildGuard(reflector);
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("allows mustChangePassword=false users (existing parents and admins) to protected routes", async () => {
    mockUser(false, "PARENT");
    const { context, reflector } = makeContext(false, false);
    await expect(buildGuard(reflector).canActivate(context)).resolves.toBe(true);

    mockUser(false, "ADMIN");
    const second = makeContext(false, false);
    await expect(buildGuard(second.reflector).canActivate(second.context)).resolves.toBe(true);
  });

  it("blocks mustChangePassword=true users from protected routes", async () => {
    mockUser(true, "PARENT");
    const { context, reflector } = makeContext(false, false);
    await expect(buildGuard(reflector).canActivate(context)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(buildGuard(reflector).canActivate(context)).rejects.toThrow("Password change required");
  });

  it("allows mustChangePassword=true users only to password-change-allowed routes", async () => {
    mockUser(true, "PARENT");
    const allowed = makeContext(false, true);
    await expect(buildGuard(allowed.reflector).canActivate(allowed.context)).resolves.toBe(true);
    expect(allowed.request.user).toMatchObject({ mustChangePassword: true });
  });

  it("is flag-driven, not role-driven: an admin with mustChangePassword=true is also blocked from protected routes", async () => {
    mockUser(true, "ADMIN");
    const { context, reflector } = makeContext(false, false);
    await expect(buildGuard(reflector).canActivate(context)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("allows logout/me/change-password when marked PasswordChangeAllowed (logout path is covered by same flag)", async () => {
    mockUser(true, "PARENT");
    // logout uses the same allow-list flag as change-password/me.
    const { context, reflector } = makeContext(false, true);
    await expect(buildGuard(reflector).canActivate(context)).resolves.toBe(true);
  });

  it("rejects an access token whose tv does not match the current tokenVersion (revoked after password change)", async () => {
    mockUser(false, "PARENT", 1);
    mockPayload(0);
    const { context, reflector } = makeContext(false, false);
    await expect(buildGuard(reflector).canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(buildGuard(reflector).canActivate(context)).rejects.toThrow("Access token has been revoked");
  });

  it("accepts tokens when tv matches tokenVersion, including legacy tokens without tv when version is 0", async () => {
    mockUser(false, "PARENT", 3);
    mockPayload(3);
    const first = makeContext(false, false);
    await expect(buildGuard(first.reflector).canActivate(first.context)).resolves.toBe(true);

    mockUser(false, "PARENT", 0);
    mockPayload(undefined); // legacy JWT has no tv claim -> treated as 0
    const second = makeContext(false, false);
    await expect(buildGuard(second.reflector).canActivate(second.context)).resolves.toBe(true);
  });
});
