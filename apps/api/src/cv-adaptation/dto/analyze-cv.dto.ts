import { Transform } from "class-transformer";
import { IsBoolean, IsOptional, IsString, MaxLength } from "class-validator";

export class AnalyzeCvDto {
  @IsOptional()
  @IsString()
  masterResumeId?: string;

  @IsString()
  @MaxLength(12000)
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  jobDescriptionText!: string;

  @IsOptional()
  @Transform(({ value }) => value === true || value === "true")
  @IsBoolean()
  saveAsMaster?: boolean;
}
