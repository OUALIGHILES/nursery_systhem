import { IsBoolean, IsEmail, IsIn, IsOptional, IsString, Length, Matches, MaxLength, MinLength } from "class-validator";
import { Type } from "class-transformer";
import type { RoleName } from "../generated/prisma/enums.js";

const ROLE_NAMES: RoleName[] = ["SUPER_ADMIN", "ADMIN", "DIRECTOR", "TEACHER", "STAFF", "PARENT"];

export class CreateUserDto {
  @IsEmail()
  email!: string;

  @IsString()
  @Length(2, 80)
  firstName!: string;

  @IsString()
  @Length(2, 80)
  lastName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string;

  @IsIn(ROLE_NAMES)
  role!: RoleName;

  /** Required when role is PARENT */
  @IsOptional()
  @IsString()
  @MaxLength(160)
  address?: string;

  /** Required when role is TEACHER/STAFF/DIRECTOR */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  jobTitle?: string;

  /** If omitted, a random temporary password is generated and emailed */
  @IsOptional()
  @IsString()
  @MinLength(10)
  @Length(10, 128)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/, { message: "password must contain upper, lower case letters and a number" })
  temporaryPassword?: string;
}

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @Length(2, 80)
  firstName?: string;

  @IsOptional()
  @IsString()
  @Length(2, 80)
  lastName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class ResetUserPasswordDto {
  @IsOptional()
  @IsString()
  @MinLength(10)
  @Length(10, 128)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/)
  temporaryPassword?: string;
}

export class QueryUsersDto {
  @IsOptional()
  @IsIn(ROLE_NAMES)
  role?: RoleName;

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
