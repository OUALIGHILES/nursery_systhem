import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
} from "class-validator";
import type { ProgramType } from "../generated/prisma/enums.js";

const PROGRAMS: ProgramType[] = ["INFANTS", "TODDLERS", "PRESCHOOL", "EARLY_LEARNING"];

export class CreateClassroomDto {
  @IsString()
  @Length(2, 120)
  name!: string;

  @IsIn(PROGRAMS)
  program!: ProgramType;

  @IsInt()
  @Min(0)
  @Max(36)
  ageGroupMin!: number;

  @IsInt()
  @Min(1)
  @Max(72)
  ageGroupMax!: number;

  @IsInt()
  @Min(1)
  @Max(60)
  capacity!: number;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  room?: string;

  @IsOptional()
  @IsString()
  @MaxLength(16)
  color?: string;
}

export class UpdateClassroomDto {
  @IsOptional()
  @IsString()
  @Length(2, 120)
  name?: string;

  @IsOptional()
  @IsIn(PROGRAMS)
  program?: ProgramType;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(36)
  ageGroupMin?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(72)
  ageGroupMax?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(60)
  capacity?: number;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  room?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(16)
  color?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
