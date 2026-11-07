import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";
import { Type } from "class-transformer";

export const NOTIFICATION_TYPES = ["CHECK_IN","CHECK_OUT","ABSENCE","INVOICE","PAYMENT","MESSAGE","INCIDENT","ENROLLMENT","ACTIVITY","GENERAL"] as const;

export class InboxQueryDto {
  @IsOptional()
  @IsIn(["all", "unread", "read"])
  status?: "all" | "unread" | "read";

  @IsOptional()
  @IsIn(NOTIFICATION_TYPES as unknown as string[])
  type?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}

export class ReadDto {
  @IsOptional()
  @IsString()
  @MaxLength(10)
  _ignored?: string;
}
