import {
  IngestionJobScheduleType,
  IngestionJobScopeType,
  IngestionJobType,
  JobSourceType,
} from "@prisma/client";
import { Transform } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from "class-validator";

export class CreateIngestionJobDto {
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsEnum(IngestionJobType)
  jobType!: IngestionJobType;

  @ValidateIf((dto) => dto.jobType === "CRAWL")
  @IsEnum(IngestionJobScopeType)
  scopeType?: IngestionJobScopeType;

  @ValidateIf((dto) => dto.scopeType === "ADAPTER")
  @IsEnum(JobSourceType)
  adapterType?: JobSourceType;

  @ValidateIf((dto) => dto.scopeType === "SOURCE")
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @MinLength(1)
  jobSourceId?: string;

  @IsEnum(IngestionJobScheduleType)
  scheduleType!: IngestionJobScheduleType;

  @ValidateIf(
    (dto) => dto.scheduleType === "DAILY" || dto.scheduleType === "WEEKLY",
  )
  @IsInt()
  @Min(0)
  @Max(23)
  scheduleHour?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(59)
  scheduleMinute?: number;

  @ValidateIf((dto) => dto.scheduleType === "EVERY_N_HOURS")
  @IsInt()
  @Min(1)
  @Max(24)
  scheduleInterval?: number;

  @ValidateIf((dto) => dto.scheduleType === "WEEKLY")
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(7)
  @IsIn([0, 1, 2, 3, 4, 5, 6], { each: true })
  scheduleDaysOfWeek?: number[];
}
