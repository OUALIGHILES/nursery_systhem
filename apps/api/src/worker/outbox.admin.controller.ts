import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { IsOptional, IsString, MaxLength } from "class-validator";
import { Type } from "class-transformer";
import { CurrentUser, type AuthenticatedUser } from "../common/decorators/current-user.decorator.js";
import { Roles } from "../common/decorators/roles.decorator.js";
import { OutboxControlService } from "./outbox-control.service.js";

export class OutboxSkipDto {
  @IsString()
  @MaxLength(400)
  reason!: string;
}

export class OutboxReleaseDto {}

export class OutboxPendingQueryDto {
  @IsOptional()
  @Type(() => Number)
  limit?: number;
}

@ApiTags("admin")
@ApiBearerAuth()
@Controller("admin/outbox")
export class OutboxAdminController {
  constructor(private readonly control: OutboxControlService) {}

  @Get("summary")
  @Roles("SUPER_ADMIN", "ADMIN", "DIRECTOR")
  summary() {
    return this.control.summary();
  }

  @Get("pending")
  @Roles("SUPER_ADMIN", "ADMIN", "DIRECTOR")
  pending(@Query() query: OutboxPendingQueryDto) {
    return this.control.listPending(query.limit ?? 50);
  }

  @Post("skip/:eventId")
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Roles("SUPER_ADMIN", "ADMIN", "DIRECTOR")
  skip(
    @Param("eventId") eventId: string,
    @Body() dto: OutboxSkipDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.control.skipHistorical(eventId, dto.reason, actor.id);
  }

  @Post("release/:eventId")
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Roles("SUPER_ADMIN", "ADMIN", "DIRECTOR")
  release(
    @Param("eventId") eventId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.control.releaseSingle(eventId, actor.id);
  }
}
