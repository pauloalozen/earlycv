import { ContractType, JobArea, SeniorityLevel } from "@prisma/client";
import { IsArray, IsEnum, IsOptional, IsString } from "class-validator";

export class UpdateRadarProfileDto {
  @IsOptional()
  @IsArray()
  @IsEnum(JobArea, { each: true })
  areas?: JobArea[];

  @IsOptional()
  @IsEnum(SeniorityLevel)
  seniority?: SeniorityLevel;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  preferredWorkModels?: string[];

  @IsOptional()
  @IsArray()
  @IsEnum(ContractType, { each: true })
  preferredContractTypes?: ContractType[];
}
