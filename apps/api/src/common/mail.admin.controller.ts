import { Body, Controller, Get, Ip, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { IsEmail, IsOptional, IsString, MaxLength } from "class-validator";
import { CurrentUser, type AuthenticatedUser } from "./decorators/current-user.decorator.js";
import { Roles } from "./decorators/roles.decorator.js";
import { MailAdminService } from "./mail.admin.service.js";

export class SendTestEmailDto {
  @IsEmail()
  @MaxLength(254)
  to!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  subject?: string;
}

@ApiTags("admin")
@ApiBearerAuth()
@Controller("admin/mail")
export class MailAdminController {
  constructor(private readonly admin: MailAdminService) {}

  @Get("status")
  @Roles("SUPER_ADMIN", "ADMIN", "DIRECTOR")
  status() {
    return this.admin.status();
  }

  @Post("test-email")
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Roles("SUPER_ADMIN", "ADMIN", "DIRECTOR")
  sendTest(
    @Body() dto: SendTestEmailDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Ip() ip: string,
  ) {
    return this.admin.sendTestEmail(dto.to, actor, ip);
  }
}
