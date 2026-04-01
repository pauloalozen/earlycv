import { ResumeStatus } from "@prisma/client";
import { Transform } from "class-transformer";
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from "class-validator";

export class UpdateResumeDto {
  @IsOptional()
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @MaxLength(160)
  title?: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @MaxLength(255)
  sourceFileName?: string;

  @IsOptional()
  @IsEnum(ResumeStatus)
  status?: ResumeStatus;

  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;
}
