import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { ForbiddenException } from "@nestjs/common";
import { CurrentUser, type AuthenticatedUser } from "../common/decorators/current-user.decorator.js";
import { AttendanceService } from "./attendance.service.js";
import { AttendanceRangeDto, CheckInDto, CheckOutDto, MarkAbsentDto, QueryAttendanceDto } from "./dto.js";

@ApiTags("attendance")
@ApiBearerAuth()
@Controller("attendance")
export class AttendanceController {
  constructor(private readonly attendance: AttendanceService) {}

  @Post("check-in")
  checkIn(@Body() dto: CheckInDto, @CurrentUser() user: AuthenticatedUser) {
    return this.attendance.checkIn(dto, user);
  }

  @Post("check-out")
  checkOut(@Body() dto: CheckOutDto, @CurrentUser() user: AuthenticatedUser) {
    return this.attendance.checkOut(dto, user);
  }

  @Post("absent")
  markAbsent(@Body() dto: MarkAbsentDto, @CurrentUser() user: AuthenticatedUser) {
    return this.attendance.markAbsent(dto, user);
  }

  @Get()
  list(@Query() query: QueryAttendanceDto, @CurrentUser() user: AuthenticatedUser) {
    return this.attendance.list(query, user);
  }

  @Get("calendar")
  calendar(@Query("month") month: string, @Query("childId") childId: string | undefined, @CurrentUser() user: AuthenticatedUser) {
    return this.attendance.calendar(month, childId, user);
  }

  @Get("report")
  report(@Query() range: AttendanceRangeDto, @CurrentUser() user: AuthenticatedUser) {
    return this.attendance.report(range, user);
  }

  @Get("child/:childId")
  childHistory(@Param("childId") childId: string, @Query() range: AttendanceRangeDto, @CurrentUser() user: AuthenticatedUser) {
    return this.attendance.list({ childId, page: 1, pageSize: 100 }, user);
  }
}
