import { Transform } from "class-transformer";
import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from "class-validator";

export class AnalyzeCvDto {
  @IsOptional()
  @IsIn(["file_upload", "text_paste", "profile"])
  inputMode?: "file_upload" | "text_paste" | "profile";

  @IsOptional()
  @IsString()
  masterResumeId?: string;

  @IsString()
  @MaxLength(12000)
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  jobDescriptionText!: string;

  @IsOptional()
  @IsString()
  @MaxLength(20000)
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  masterCvText?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4096)
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  turnstileToken?: string;

  @IsOptional()
  @Transform(({ value }) => value === true || value === "true")
  @IsBoolean()
  saveAsMaster?: boolean;
}
