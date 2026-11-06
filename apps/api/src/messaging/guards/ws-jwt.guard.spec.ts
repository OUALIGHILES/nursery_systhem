import { ForbiddenException, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { WsJwtGuard } from "./ws-jwt.guard.js";

function makeClient(token = "Bearer valid-token") {
  return {
    handshake: {
      headers: { authorization: token, cookie: "" },
      auth: {},
    },
  } as never;
}

describe("WsJwtGuard", () => {
  let jwt: { verifyAsync: ReturnType<typeof vi.fn> };
  let config: { get: ReturnType<typeof vi.fn> };
  let messaging: { authenticateSocketUser: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    jwt = { verifyAsync: vi.fn() };
    config = { get: vi.fn().mockReturnValue("test-secret-that-is-at-least-thirty-two-chars-long") };
    messaging = { authenticateSocketUser: vi.fn() };
  });

  function build() {
    return new WsJwtGuard(jwt as never, config as never, messaging as never);
  }

  it("authenticates a valid token and passes its tokenVersion to the service", async () => {
    jwt.verifyAsync.mockResolvedValue({ sub: "user-1", tv: 2 });
    messaging.authenticateSocketUser.mockResolvedValue({ id: "user-1" });
    const result = await build().authenticate(makeClient());
    expect(result).toEqual({ id: "user-1" });
    expect(messaging.authenticateSocketUser).toHaveBeenCalledWith("user-1", 2);
  });

  it("treats legacy tokens without tv as version 0", async () => {
    jwt.verifyAsync.mockResolvedValue({ sub: "user-1" });
    messaging.authenticateSocketUser.mockResolvedValue({ id: "user-1" });
    await build().authenticate(makeClient());
    expect(messaging.authenticateSocketUser).toHaveBeenCalledWith("user-1", 0);
  });

  it("rejects missing tokens", async () => {
    await expect(build().authenticate(makeClient("")))
      .rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("rejects expired/invalid tokens", async () => {
    jwt.verifyAsync.mockRejectedValue(new Error("jwt expired"));
    await expect(build().authenticate(makeClient()))
      .rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("propagates mustChangePassword and token-revocation rejections from the service", async () => {
    jwt.verifyAsync.mockResolvedValue({ sub: "user-1", tv: 0 });
    messaging.authenticateSocketUser.mockRejectedValue(new ForbiddenException("Password change required"));
    await expect(build().authenticate(makeClient())).rejects.toBeInstanceOf(ForbiddenException);
  });
});
