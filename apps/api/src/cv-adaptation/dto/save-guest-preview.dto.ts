import { Transform } from "class-transformer";
import {
  Allow,
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
} from "class-validator";

export class SaveGuestPreviewDto {
  /**
   * The full analysis JSON from the guest flow. Accepts any object
   * structure — deliberately permissive to avoid class-transformer
   * issues with deeply nested JSON fields.
   */
  @Allow()
  @Transform(({ value }) => {
    if (typeof value !== "string") return value;

    try {
      return JSON.parse(value) as Record<string, unknown>;
    } catch {
      return value;
    }
  })
  adaptedContentJson!: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  previewText?: string;

  @IsString()
  @MaxLength(8000)
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  jobDescriptionText!: string;

  @IsString()
  @MaxLength(80000)
  masterCvText!: string;

  @IsString()
  @MaxLength(191)
  analysisCvSnapshotId!: string;

  @IsOptional()
  @Transform(({ value }) => value === true || value === "true")
  @IsBoolean()
  saveAsMaster?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  jobTitle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  companyName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  guestSessionPublicToken?: string;
}
