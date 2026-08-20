import { Type } from "class-transformer";
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from "class-validator";

const SENIORITY_VALUES = [
  "INTERN",
  "JUNIOR",
  "MID",
  "SENIOR",
  "LEAD",
  "STAFF",
  "MANAGER",
  "DIRECTOR",
  "UNKNOWN",
] as const;

const JOB_AREA_VALUES = [
  "DATA_AI",
  "SOFTWARE_ENGINEERING",
  "CLOUD_DEVOPS",
  "CYBERSECURITY",
  "PRODUCT",
  "DESIGN_UX",
  "QA_TEST",
  "PROJECT_AGILE",
  "ARCHITECTURE",
  "LEADERSHIP",
  "GROWTH_MARKETING",
  "BUSINESS_ANALYTICS",
  "CX_DIGITAL",
  "IT_SUPPORT",
  "ERP_FUNCTIONAL",
  "OTHER",
] as const;

export type TalentSeniorityFilter = (typeof SENIORITY_VALUES)[number];
export type TalentJobAreaFilter = (typeof JOB_AREA_VALUES)[number];

export class SearchTalentProfilesDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;

  @IsOptional()
  @IsString()
  query?: string;

  @IsOptional()
  @IsString()
  technology?: string;

  @IsOptional()
  @IsString()
  language?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minYearsExperience?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  maxYearsExperience?: number;

  @IsOptional()
  @IsIn(SENIORITY_VALUES)
  seniority?: TalentSeniorityFilter;

  @IsOptional()
  @IsIn(JOB_AREA_VALUES)
  primaryArea?: TalentJobAreaFilter;
}
