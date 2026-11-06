import {
  BadRequestException,
  Injectable,
  Logger,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import argon2 from "argon2";
import { PrismaService } from "../prisma/prisma.service.js";
import { MailService } from "../common/mail.service.js";
import { AuditService } from "../common/audit.service.js";
import type { Env } from "../config/env.js";
import { generateOpaqueToken, hashToken, parseTtlMs } from "./auth.tokens.js";
import type { RoleName } from "../generated/prisma/enums.js";

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<Env, true>,
    private readonly mail: MailService,
    private readonly audit: AuditService,
  ) {}

  async validateUser(email: string, password: string) {
    const user = await this.prisma.user.findFirst({
      where: { email: email.toLowerCase().trim(), deletedAt: null },
      include: { role: true, parentProfile: true, staffProfile: true },
    });
    if (!user) {
      // Mitigate user enumeration via timing
      await argon2.hash(password);
      return null;
    }
    const ok = await argon2.verify(user.passwordHash, password).catch(() => false);
    if (!ok || !user.isActive) return null;
    return user;
  }

  async login(email: string, password: string, ip?: string, userAgent?: string) {
    const user = await this.validateUser(email, password);
    if (!user) throw new UnauthorizedException("Invalid credentials");
    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    const tokens = await this.issueTokenPair(user.id, user.role.name, { ip, userAgent });
    await this.audit.log({ actorId: user.id, action: "auth.login", entity: "User", entityId: user.id, ipAddress: ip });
    return { tokens, user: this.publicUser(user) };
  }

  async issueTokenPair(userId: string, role: RoleName, meta: { ip?: string; userAgent?: string } = {}): Promise<TokenPair> {
    const accessTtl = this.config.get("JWT_ACCESS_TTL", { infer: true });
    const refreshTtl = this.config.get("JWT_REFRESH_TTL", { infer: true });
    const accessToken = await this.jwt.signAsync(
      { sub: userId, role },
      { secret: this.config.get("JWT_ACCESS_SECRET", { infer: true }), expiresIn: parseTtlMs(accessTtl) / 1000 },
    );
    const refreshToken = generateOpaqueToken(48);
    const expiresAt = new Date(Date.now() + parseTtlMs(refreshTtl));
    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: hashToken(refreshToken),
        expiresAt,
        ipAddress: meta.ip ?? null,
        userAgent: meta.userAgent?.slice(0, 300) ?? null,
      },
    });
    return { accessToken, refreshToken, expiresIn: parseTtlMs(accessTtl) / 1000 };
  }

  /** Rotate refresh token; detect reuse of revoked tokens. */
  async refresh(rawToken: string, meta: { ip?: string; userAgent?: string } = {}): Promise<TokenPair & { user: ReturnType<AuthService["publicUser"]> }> {
    const tokenHash = hashToken(rawToken);
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: { include: { role: true, parentProfile: true, staffProfile: true } } },
    });
    if (!stored) throw new UnauthorizedException("Invalid refresh token");

    if (stored.revokedAt) {
      // Reuse of a rotated token -> compromise signal: revoke the whole session family
      await this.prisma.refreshToken.updateMany({
        where: { userId: stored.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      this.logger.warn(`Refresh token reuse detected for user ${stored.userId}; all sessions revoked`);
      throw new UnauthorizedException("Refresh token reuse detected; please sign in again");
    }
    if (stored.expiresAt < new Date()) throw new UnauthorizedException("Refresh token expired");
    if (!stored.user.isActive || stored.user.deletedAt) throw new UnauthorizedException("Account not available");

    const newPair = await this.issueTokenPair(stored.userId, stored.user.role.name, meta);
    const newHash = hashToken(newPair.refreshToken);
    const replacement = await this.prisma.refreshToken.findUnique({ where: { tokenHash: newHash } });
    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date(), replacedById: replacement?.id ?? null },
    });
    return { ...newPair, user: this.publicUser(stored.user) };
  }

  async logout(rawToken?: string) {
    if (!rawToken) return;
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: hashToken(rawToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async logoutAll(userId: string) {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async forgotPassword(email: string) {
    const user = await this.prisma.user.findFirst({
      where: { email: email.toLowerCase().trim(), isActive: true, deletedAt: null },
    });
    // Always respond identically to avoid account enumeration
    if (user) {
      const raw = generateOpaqueToken(48);
      await this.prisma.passwordResetToken.create({
        data: { userId: user.id, tokenHash: hashToken(raw), expiresAt: new Date(Date.now() + 60 * 60 * 1000) },
      });
      const webUrl = (this.config.get("CORS_ORIGINS", { infer: true }).split(",")[0] ?? "http://localhost:3000").trim();
      const link = `${webUrl}/reset-password?token=${raw}`;
      await this.mail.send(user.email, "Reset your password", `Reset your Little Steps Nursery password using this link (valid for 1 hour): ${link}`);
      await this.audit.log({ actorId: user.id, action: "auth.password_reset_requested", entity: "User", entityId: user.id });
    }
    return { message: "If an account exists for that email, a reset link has been sent." };
  }

  async resetPassword(rawToken: string, newPassword: string) {
    const tokenHash = hashToken(rawToken);
    const stored = await this.prisma.passwordResetToken.findUnique({ where: { tokenHash } });
    if (!stored || stored.usedAt || stored.expiresAt < new Date()) {
      throw new BadRequestException("Invalid or expired reset token");
    }
    const passwordHash = await argon2.hash(newPassword, { type: argon2.argon2id });
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: stored.userId }, data: { passwordHash, mustChangePassword: false } }),
      this.prisma.passwordResetToken.update({ where: { id: stored.id }, data: { usedAt: new Date() } }),
      this.prisma.refreshToken.updateMany({ where: { userId: stored.userId, revokedAt: null }, data: { revokedAt: new Date() } }),
    ]);
    await this.audit.log({ actorId: stored.userId, action: "auth.password_reset", entity: "User", entityId: stored.userId });
    return { message: "Password updated. Please sign in with your new password." };
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();
    const ok = await argon2.verify(user.passwordHash, currentPassword).catch(() => false);
    if (!ok) throw new BadRequestException("Current password is incorrect");
    const passwordHash = await argon2.hash(newPassword, { type: argon2.argon2id });
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: userId }, data: { passwordHash, mustChangePassword: false } }),
      this.prisma.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } }),
    ]);
    await this.audit.log({ actorId: userId, action: "auth.password_changed", entity: "User", entityId: userId });
    return { message: "Password changed. Please sign in again." };
  }

  async verifyEmail(rawToken: string) {
    const tokenHash = hashToken(rawToken);
    const stored = await this.prisma.emailVerificationToken.findUnique({ where: { tokenHash } });
    if (!stored || stored.usedAt || stored.expiresAt < new Date()) {
      throw new BadRequestException("Invalid or expired verification token");
    }
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: stored.userId }, data: { emailVerifiedAt: new Date() } }),
      this.prisma.emailVerificationToken.update({ where: { id: stored.id }, data: { usedAt: new Date() } }),
    ]);
    return { message: "Email verified." };
  }

  async me(userId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      include: { role: true, parentProfile: true, staffProfile: true },
    });
    if (!user) throw new UnauthorizedException();
    return this.publicUser(user);
  }

  publicUser(user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    mustChangePassword: boolean;
    role: { name: RoleName };
    parentProfile?: { id: string } | null;
    staffProfile?: { id: string } | null;
  }) {
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role.name,
      mustChangePassword: user.mustChangePassword,
      parentId: user.parentProfile?.id ?? null,
      staffId: user.staffProfile?.id ?? null,
    };
  }
}
