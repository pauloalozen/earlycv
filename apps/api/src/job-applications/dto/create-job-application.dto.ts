import type { JobApplicationOrigin } from "@prisma/client";
import {
  IsEnum,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  MinLength,
  ValidateIf,
} from "class-validator";

export class CreateJobApplicationDto {
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  jobTitle!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(255)
  companyName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  location?: string;

  @IsOptional()
  @IsUrl()
  @MaxLength(2048)
  @ValidateIf((o: CreateJobApplicationDto) => o.origin === "imported_url")
  @IsString()
  jobUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20000)
  jobDescriptionText?: string;

  @IsOptional()
  @IsEnum([
    "analysis_auto",
    "optimized_cv_auto",
    "manual",
    "imported_url",
    "job_portal",
  ])
  origin?: JobApplicationOrigin;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
