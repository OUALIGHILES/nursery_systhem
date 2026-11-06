import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  MaxLength,
} from "class-validator";
import { Type } from "class-transformer";
import type { Gender, RelationType, ChildStatus } from "../generated/prisma/enums.js";

const GENDERS: Gender[] = ["MALE", "FEMALE", "OTHER", "PREFER_NOT_TO_SAY"];
const RELATIONS: RelationType[] = ["MOTHER", "FATHER", "GUARDIAN", "OTHER"];

export class CreateChildDto {
  @IsString()
  @Length(2, 80)
  firstName!: string;

  @IsString()
  @Length(2, 80)
  lastName!: string;

  @IsDateString()
  dateOfBirth!: string;

  @IsIn(GENDERS)
  gender!: Gender;

  @IsOptional()
  @IsUUID()
  classroomId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  medicalNotes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8)
  bloodType?: string;
}

export class UpdateChildDto {
  @IsOptional()
  @IsString()
  @Length(2, 80)
  firstName?: string;

  @IsOptional()
  @IsString()
  @Length(2, 80)
  lastName?: string;

  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;

  @IsOptional()
  @IsIn(GENDERS)
  gender?: Gender;

  @IsOptional()
  @IsUUID()
  classroomId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  medicalNotes?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(8)
  bloodType?: string | null;

  @IsOptional()
  @IsIn(["ACTIVE", "ARCHIVED"])
  status?: ChildStatus;
}

export class QueryChildrenDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;

  @IsOptional()
  @IsUUID()
  classroomId?: string;

  @IsOptional()
  @IsIn(["ACTIVE", "ARCHIVED"])
  status?: ChildStatus;

  @IsOptional()
  @Type(() => Number)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  pageSize?: number;
}

export class LinkParentDto {
  @IsUUID()
  parentId!: string;

  @IsIn(RELATIONS)
  relation!: RelationType;

  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;

  @IsOptional()
  @IsBoolean()
  canPickup?: boolean;
}

export class CreatePickupDto {
  @IsString()
  @Length(2, 120)
  fullName!: string;

  @IsString()
  @Length(2, 60)
  relation!: string;

  @IsString()
  @Length(6, 32)
  phone!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  idDocument?: string;
}

export class AssignClassroomDto {
  @IsOptional()
  @IsUUID()
  classroomId!: string | null;
}
