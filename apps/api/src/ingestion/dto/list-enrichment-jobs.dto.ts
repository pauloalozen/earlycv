import { EnrichmentStatus } from "@prisma/client";
import { Transform, Type } from "class-transformer";
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from "class-validator";

export class ListEnrichmentJobsDto {
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
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  sourceId?: string;

  @IsOptional()
  @IsEnum(EnrichmentStatus)
  status?: EnrichmentStatus;
}
