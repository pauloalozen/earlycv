import {
  ArrayMaxSize,
  IsArray,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from "class-validator";

export class ClaimGuestAdaptationDto {
  @IsObject()
  adaptedContentJson!: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  previewText?: string;

  @IsString()
  @MaxLength(12000)
  jobDescriptionText!: string;

  @IsString()
  @MaxLength(60000)
  masterCvText!: string;

  @IsString()
  @MaxLength(191)
  analysisCvSnapshotId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  jobTitle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  companyName?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(80)
  @IsString({ each: true })
  selectedMissingKeywords?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(512)
  guestSessionPublicToken?: string;
}
