import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { CurrentUser, type AuthenticatedUser } from "../common/decorators/current-user.decorator.js";
import { Public } from "../common/decorators/public.decorator.js";
import { Roles } from "../common/decorators/roles.decorator.js";
import {
  CreateEnrollmentApplicationDto,
  QueryEnrollmentApplicationsDto,
  ReviewEnrollmentApplicationDto,
} from "./enrollment.dto.js";
import { EnrollmentService } from "./enrollment.service.js";

@ApiTags("enrollment")
@Controller("enrollment-applications")
export class EnrollmentController {
  constructor(private readonly enrollment: EnrollmentService) {}

  @Public()
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @Post()
  submit(@Body() dto: CreateEnrollmentApplicationDto) {
    return this.enrollment.submit(dto);
  }

  @ApiBearerAuth()
  @Roles("SUPER_ADMIN", "ADMIN", "DIRECTOR")
  @Get()
  list(@Query() query: QueryEnrollmentApplicationsDto) {
    return this.enrollment.list(query);
  }

  @ApiBearerAuth()
  @Roles("PARENT")
  @Get("my-applications")
  myApplications(@CurrentUser() user: AuthenticatedUser, @Query() query: QueryEnrollmentApplicationsDto) {
    return this.enrollment.myApplications(user.email, query);
  }

  @ApiBearerAuth()
  @Roles("SUPER_ADMIN", "ADMIN", "DIRECTOR")
  @Get(":id")
  get(@Param("id") id: string) {
    return this.enrollment.get(id);
  }

  @ApiBearerAuth()
  @Roles("SUPER_ADMIN", "ADMIN", "DIRECTOR")
  @Patch(":id")
  review(
    @Param("id") id: string,
    @Body() dto: ReviewEnrollmentApplicationDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.enrollment.review(id, dto, actor);
  }
}
