import { IsObject, IsOptional, IsString, MaxLength } from "class-validator";

export class ClaimGuestAdaptationDto {
  @IsObject()
  adaptedContentJson!: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  previewText?: string;

  @IsString()
  @MaxLength(8000)
  jobDescriptionText!: string;

  @IsString()
  @MaxLength(60000)
  masterCvText!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  jobTitle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  companyName?: string;
}
