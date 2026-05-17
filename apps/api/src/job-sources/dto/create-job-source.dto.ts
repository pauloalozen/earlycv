import { CrawlStrategy, JobSourceType } from "@prisma/client";
import { Transform, Type } from "class-transformer";
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  IsUrl,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";

export class CreateJobSourceDto {
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @MinLength(1)
  companyId!: string;

  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  sourceName!: string;

  @IsEnum(JobSourceType)
  sourceType!: JobSourceType;

  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsUrl({ require_protocol: true })
  @MaxLength(2048)
  sourceUrl!: string;

  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  parserKey!: string;

  @IsEnum(CrawlStrategy)
  crawlStrategy!: CrawlStrategy;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  checkIntervalMinutes!: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsBoolean()
  scheduleEnabled?: boolean;

  @IsOptional()
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  scheduleCron?: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @Matches(/^America\/Sao_Paulo$/)
  scheduleTimezone?: string;

  @IsOptional()
  @IsBoolean()
  isFallbackAdapter?: boolean;
}
