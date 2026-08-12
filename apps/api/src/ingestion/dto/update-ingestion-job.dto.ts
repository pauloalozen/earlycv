import { IngestionJobScheduleType } from "@prisma/client";
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

export class UpdateIngestionJobDto {
  @IsOptional()
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsEnum(IngestionJobScheduleType)
  scheduleType?: IngestionJobScheduleType;

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
