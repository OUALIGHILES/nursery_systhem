import {
  IsInt,
  IsDateString,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
} from "class-validator";
import { Type } from "class-transformer";
import type {
  EnrollmentStatus,
  Gender,
  ProgramType,
  RelationType,
} from "../generated/prisma/enums.js";

const RELATIONS: RelationType[] = ["MOTHER", "FATHER", "GUARDIAN", "OTHER"];
const GENDERS: Gender[] = ["MALE", "FEMALE", "OTHER", "PREFER_NOT_TO_SAY"];
const PROGRAMS: ProgramType[] = ["INFANTS", "TODDLERS", "PRESCHOOL", "EARLY_LEARNING"];
const STATUSES: EnrollmentStatus[] = ["PENDING", "UNDER_REVIEW", "INFO_REQUESTED", "APPROVED", "REJECTED"];

export class CreateEnrollmentApplicationDto {
  @IsString()
  @Length(1, 80)
  parentFirstName!: string;

  @IsString()
  @Length(1, 80)
  parentLastName!: string;

  @IsEmail()
  @MaxLength(254)
  parentEmail!: string;

  @IsString()
  @Length(5, 32)
  parentPhone!: string;

  @IsString()
  @Length(1, 500)
  parentAddress!: string;

  @IsIn(RELATIONS)
  relation!: RelationType;

  @IsString()
  @Length(1, 80)
  childFirstName!: string;

  @IsString()
  @Length(1, 80)
  childLastName!: string;

  @IsDateString()
  childDateOfBirth!: string;

  @IsOptional()
  @IsIn(GENDERS)
  childGender?: Gender;

  @IsIn(PROGRAMS)
  requestedProgram!: ProgramType;

  @IsDateString()
  requestedStartDate!: string;

  @IsString()
  @Length(1, 120)
  emergencyContactName!: string;

  @IsString()
  @Length(5, 32)
  emergencyContactPhone!: string;

  @IsString()
  @Length(1, 80)
  emergencyContactRelation!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  allergies?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  medicalNotes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  additionalInfo?: string;
}

export class ReviewEnrollmentApplicationDto {
  @IsIn(STATUSES)
  status!: EnrollmentStatus;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  adminNotes?: string;
}

export class QueryEnrollmentApplicationsDto {
  @IsOptional()
  @IsIn(STATUSES)
  status?: EnrollmentStatus;

  @IsOptional()
  @IsString()
  @MaxLength(120)
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
