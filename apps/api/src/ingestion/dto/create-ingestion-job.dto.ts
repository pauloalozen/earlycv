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
  IsBoolean,
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

  @ValidateIf((dto) => dto.jobType === "CRAWL" || dto.jobType === "LOGO_FETCH")
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

  // Só relevante pra jobType LOGO_FETCH — pula companies que já têm
  // logoUrl preenchido (delta) em vez de reprocessar todas do escopo.
  @IsOptional()
  @IsBoolean()
  onlyMissingLogo?: boolean;

  // Só relevante pra jobType DISCOVERY_VALIDATE — quantos candidatos
  // PENDING processar por execução (ausente = fila inteira).
  @ValidateIf((dto) => dto.jobType === "DISCOVERY_VALIDATE")
  @IsOptional()
  @IsInt()
  @Min(1)
  discoveryValidateLimit?: number;

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
