import { ResumeKind, ResumeStatus } from "@prisma/client";
import { Transform } from "class-transformer";
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from "class-validator";

export class UpdateAdminResumeDto {
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
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @MaxLength(255)
  sourceFileType?: string;

  @IsOptional()
  @IsEnum(ResumeStatus)
  status?: ResumeStatus;

  @IsOptional()
  @IsEnum(ResumeKind)
  kind?: ResumeKind;

  @IsOptional()
  @IsBoolean()
  isMaster?: boolean;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  basedOnResumeId?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  templateId?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  targetJobId?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @MaxLength(160)
  targetJobTitle?: string | null;
}
