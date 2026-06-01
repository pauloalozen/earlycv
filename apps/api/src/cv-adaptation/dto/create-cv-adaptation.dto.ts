import { Transform } from "class-transformer";
import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from "class-validator";

export class CreateCvAdaptationDto {
  @IsOptional()
  @IsIn(["file_upload", "text_paste", "profile"])
  inputMode?: "file_upload" | "text_paste" | "profile";

  @IsOptional()
  @IsString()
  masterResumeId?: string;

  @IsString()
  @MaxLength(12000)
  @Transform(({ value }) => value?.trim())
  jobDescriptionText!: string;

  @IsOptional()
  @Transform(({ value }) => value === true || value === "true")
  @IsBoolean()
  saveAsMaster?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  @Transform(({ value }) => value?.trim())
  jobTitle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  @Transform(({ value }) => value?.trim())
  companyName?: string;

  @IsOptional()
  @IsString()
  templateId?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => value?.trim())
  turnstileToken?: string;
}

export type FileUpload = {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};
