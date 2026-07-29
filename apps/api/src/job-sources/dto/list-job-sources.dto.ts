import { Type } from "class-transformer";
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from "class-validator";

const SORT_BY_VALUES = [
  "sourceName",
  "company",
  "sourceType",
  "activeJobsCount",
  "createdAt",
] as const;

export type JobSourceSortBy = (typeof SORT_BY_VALUES)[number];

export class ListJobSourcesDto {
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
  @IsString()
  statusFilter?: string;

  @IsOptional()
  @IsString()
  typeFilter?: string;

  @IsOptional()
  @IsIn(SORT_BY_VALUES)
  sortBy?: JobSourceSortBy;

  @IsOptional()
  @IsIn(["asc", "desc"])
  sortDir?: "asc" | "desc";
}
