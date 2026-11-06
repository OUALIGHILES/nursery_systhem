import {
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  MaxLength,
} from "class-validator";
import { Type } from "class-transformer";
import type { AttendanceStatus } from "../generated/prisma/enums.js";

export class CheckInDto {
  @IsUUID()
  childId!: string;

  @IsOptional()
  @IsUUID()
  pickedUpById?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class CheckOutDto {
  @IsUUID()
  childId!: string;

  /** AuthorizedPickup id that was verified at the door (or omitted for parent pickup) */
  @IsOptional()
  @IsUUID()
  pickupId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class MarkAbsentDto {
  @IsUUID()
  childId!: string;

  @IsOptional()
  @IsDateString()
  date?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  @IsOptional()
  @IsIn(["ABSENT", "EXCUSED"])
  status?: Extract<AttendanceStatus, "ABSENT" | "EXCUSED">;
}

export class QueryAttendanceDto {
  @IsOptional()
  @IsDateString()
  date?: string;

  @IsOptional()
  @IsUUID()
  classroomId?: string;

  @IsOptional()
  @IsUUID()
  childId?: string;

  @IsOptional()
  @IsIn(["PRESENT", "LATE", "ABSENT", "EXCUSED"])
  status?: AttendanceStatus;

  @IsOptional()
  @Type(() => Number)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  pageSize?: number;
}

export class AttendanceRangeDto {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsUUID()
  classroomId?: string;

  @IsOptional()
  @IsUUID()
  childId?: string;
}
