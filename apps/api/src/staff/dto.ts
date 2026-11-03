import { IsIn, IsOptional, IsString, IsUUID, Length, MaxLength } from "class-validator";
import { Type } from "class-transformer";

export class UpdateStaffDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  jobTitle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  department?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  bio?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  qualifications?: string | null;
}

export class AssignClassroomStaffDto {
  @IsUUID()
  classroomId!: string;

  @IsOptional()
  @IsString()
  @Length(2, 60)
  roleInRoom?: string;
}

export class QueryStaffDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;

  @IsOptional()
  @Type(() => Number)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  pageSize?: number;
}
