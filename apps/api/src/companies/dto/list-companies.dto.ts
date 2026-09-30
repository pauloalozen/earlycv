import { Type } from "class-transformer";
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from "class-validator";

export const COMPANY_STATUS_LABELS = [
  "incompleta",
  "aguardando primeiro run",
  "com falha recente",
  "completa",
] as const;

export type CompanyStatusLabel = (typeof COMPANY_STATUS_LABELS)[number];

export class ListCompaniesDto {
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
  search?: string;

  @IsOptional()
  @IsIn(COMPANY_STATUS_LABELS)
  status?: CompanyStatusLabel;
}
