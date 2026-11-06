import {
  Body,
  Controller,
  Get,
  HttpCode,
  Ip,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Throttle } from "@nestjs/throttler";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import type { Request, Response } from "express";
import { AuthService } from "./auth.service.js";
import { ChangePasswordDto, ForgotPasswordDto, LoginDto, RefreshDto, ResetPasswordDto, VerifyEmailDto } from "./dto.js";
import { Public } from "../common/decorators/public.decorator.js";
import { PasswordChangeAllowed } from "../common/decorators/password-change-allowed.decorator.js";
import { CurrentUser, type AuthenticatedUser } from "../common/decorators/current-user.decorator.js";
import type { Env } from "../config/env.js";

@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post("login")
  @HttpCode(200)
  async login(@Body() dto: LoginDto, @Ip() ip: string, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const { tokens, user } = await this.auth.login(dto.email, dto.password, ip, req.headers["user-agent"]);
    this.setAuthCookies(res, tokens.accessToken, tokens.refreshToken);
    return { ...tokens, user };
  }

  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post("refresh")
  @HttpCode(200)
  async refresh(@Body() dto: RefreshDto, @Ip() ip: string, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const refreshToken = dto.refreshToken ?? req.cookies?.refresh_token;
    if (!refreshToken) throw new UnauthorizedException("Refresh token required");
    const result = await this.auth.refresh(refreshToken, { ip, userAgent: req.headers["user-agent"] });
    this.setAuthCookies(res, result.accessToken, result.refreshToken);
    return result;
  }

  @PasswordChangeAllowed()
  @Post("logout")
  @HttpCode(200)
  async logout(@Body() dto: Partial<RefreshDto>, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(dto.refreshToken);
    res.clearCookie("access_token");
    res.clearCookie("refresh_token");
    return { message: "Signed out" };
  }

  @Public()
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @Post("forgot-password")
  @HttpCode(200)
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.auth.forgotPassword(dto.email);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post("reset-password")
  @HttpCode(200)
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.auth.resetPassword(dto.token, dto.newPassword);
  }

  @PasswordChangeAllowed()
  @Post("change-password")
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  changePassword(@CurrentUser() user: AuthenticatedUser, @Body() dto: ChangePasswordDto) {
    return this.auth.changePassword(user.id, dto.currentPassword, dto.newPassword, dto.confirmPassword);
  }

  @Public()
  @Post("verify-email")
  @HttpCode(200)
  verifyEmail(@Body() dto: VerifyEmailDto) {
    return this.auth.verifyEmail(dto.token);
  }

  @PasswordChangeAllowed()
  @Get("me")
  @ApiBearerAuth()
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.auth.me(user.id);
  }

  private setAuthCookies(res: Response, accessToken: string, refreshToken: string) {
    const secure = this.config.get("NODE_ENV", { infer: true }) === "production";
    const common = { httpOnly: true, secure, sameSite: "lax" as const, path: "/" };
    res.cookie("access_token", accessToken, { ...common, maxAge: 15 * 60 * 1000 });
    res.cookie("refresh_token", refreshToken, { ...common, maxAge: 7 * 24 * 60 * 60 * 1000 });
  }
}
