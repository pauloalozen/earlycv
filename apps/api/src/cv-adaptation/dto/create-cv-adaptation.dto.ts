import { Transform } from "class-transformer";
import { IsOptional, IsString, MaxLength } from "class-validator";

export class CreateCvAdaptationDto {
  @IsOptional()
  @IsString()
  masterResumeId?: string;

  @IsString()
  @MaxLength(8000)
  @Transform(({ value }) => value?.trim())
  jobDescriptionText!: string;

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
}

export type FileUpload = {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};
