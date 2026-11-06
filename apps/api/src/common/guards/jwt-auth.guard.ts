import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Reflector } from "@nestjs/core";
import { JwtService } from "@nestjs/jwt";
import { IS_PUBLIC_KEY } from "../decorators/public.decorator.js";
import { PASSWORD_CHANGE_ALLOWED_KEY } from "../decorators/password-change-allowed.decorator.js";
import { PrismaService } from "../../prisma/prisma.service.js";
import type { AuthenticatedUser } from "../decorators/current-user.decorator.js";
import type { Env } from "../../config/env.js";

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService<Env, true>,
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() === "ws") return true;
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest();
    const header = request.headers["authorization"] as string | undefined;
    const cookieToken = request.cookies?.access_token as string | undefined;
    const token = header?.startsWith("Bearer ") ? header.slice(7) : cookieToken;
    if (!token) throw new UnauthorizedException("Authentication required");

    let payload: { sub: string; tv?: number };
    try {
      payload = await this.jwt.verifyAsync(token, {
        secret: this.config.get("JWT_ACCESS_SECRET", { infer: true }),
      });
    } catch {
      throw new UnauthorizedException("Invalid or expired access token");
    }

    const user = await this.prisma.user.findFirst({
      where: { id: payload.sub, isActive: true, deletedAt: null },
      include: {
        role: { select: { name: true } },
        parentProfile: { select: { id: true } },
        staffProfile: { select: { id: true } },
      },
    });
    if (!user) throw new UnauthorizedException("Account not available");

    // Access-token revocation (Phase 3): JWTs carry `tv` (User.tokenVersion at
    // issue time). Password changes/resets increment tokenVersion, so any
    // previously issued access token immediately fails this check. Legacy
    // tokens without `tv` are treated as version 0.
    const tokenVersion = payload.tv ?? 0;
    const userVersion = user.tokenVersion ?? 0;
    if (tokenVersion !== userVersion) {
      throw new UnauthorizedException("Access token has been revoked");
    }

    // Centralized mustChangePassword enforcement: accounts flag-gated by
    // mustChangePassword=true can only use endpoints explicitly marked with
    // @PasswordChangeAllowed() (change-password, me, logout). This is
    // flag-driven, not role-driven — normal ADMIN/STAFF/etc. accounts with
    // mustChangePassword=false are unaffected.
    if (user.mustChangePassword) {
      const allowed = this.reflector.getAllAndOverride<boolean>(PASSWORD_CHANGE_ALLOWED_KEY, [
        context.getHandler(),
        context.getClass(),
      ]);
      if (!allowed) {
        throw new ForbiddenException("Password change required");
      }
    }

    const authUser: AuthenticatedUser = {
      id: user.id,
      email: user.email,
      role: user.role.name,
      firstName: user.firstName,
      lastName: user.lastName,
      parentId: user.parentProfile?.id ?? null,
      staffId: user.staffProfile?.id ?? null,
      mustChangePassword: user.mustChangePassword,
    };
    request.user = authUser;
    return true;
  }
}
