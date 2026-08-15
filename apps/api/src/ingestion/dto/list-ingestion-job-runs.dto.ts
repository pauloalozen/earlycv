import { IngestionJobRunStatus, IngestionJobTrigger } from "@prisma/client";
import { Transform, Type } from "class-transformer";
import {
  IsEnum,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Max,
  Min,
} from "class-validator";

export class ListIngestionJobRunsDto {
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

  @IsOptional()
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  jobId?: string;

  @IsOptional()
  @IsEnum(IngestionJobRunStatus)
  status?: IngestionJobRunStatus;

  @IsOptional()
  @IsEnum(IngestionJobTrigger)
  triggeredBy?: IngestionJobTrigger;

  @IsOptional()
  @IsISO8601()
  dateFrom?: string;

  @IsOptional()
  @IsISO8601()
  dateTo?: string;
}
