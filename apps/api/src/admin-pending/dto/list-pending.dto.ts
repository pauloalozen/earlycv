import { Type } from "class-transformer";
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from "class-validator";

export const PENDING_TYPES = [
  "company-missing-source",
  "source-missing-first-run",
  "source-failed-recent-run",
  "user-missing-profile",
  "user-incomplete-profile",
  "user-missing-master-resume",
] as const;

export type PendingType = (typeof PENDING_TYPES)[number];

export class ListPendingDto {
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
  @IsIn(PENDING_TYPES)
  type?: PendingType;
}
