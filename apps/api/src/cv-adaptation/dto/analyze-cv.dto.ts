import { Transform } from "class-transformer";
import { IsOptional, IsString, MaxLength } from "class-validator";

export class AnalyzeCvDto {
  @IsOptional()
  @IsString()
  masterResumeId?: string;

  @IsString()
  @MaxLength(8000)
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  jobDescriptionText!: string;
}
