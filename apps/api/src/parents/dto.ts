import { IsOptional, IsString, MaxLength } from "class-validator";
import { Type } from "class-transformer";

export class UpdateParentDto {
  @IsOptional()
  @IsString()
  @MaxLength(160)
  address?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  occupation?: string | null;
}

export class QueryParentsDto {
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
