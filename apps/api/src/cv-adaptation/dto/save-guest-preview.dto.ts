import { Transform } from "class-transformer";
import { Allow, IsOptional, IsString, MaxLength } from "class-validator";

export class SaveGuestPreviewDto {
  /**
   * The full analysis JSON from the guest flow. Accepts any object
   * structure — deliberately permissive to avoid class-transformer
   * issues with deeply nested JSON fields.
   */
  @Allow()
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
}
