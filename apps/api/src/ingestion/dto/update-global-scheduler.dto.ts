import { Transform, Type } from "class-transformer";
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";

export class UpdateGlobalSchedulerDto {
  @IsBoolean()
  enabled!: boolean;

  @IsOptional()
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  globalCron?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1_000)
  @Max(600_000)
  normalDelayMs!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1_000)
  @Max(600_000)
  errorDelayMs!: number;

  @IsOptional()
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @Matches(/^America\/Sao_Paulo$/)
  timezone?: string;
}
