import { Transform, Type } from "class-transformer";
import { IsIn, IsInt, IsOptional, Max, Min } from "class-validator";

export const ADMIN_MONITOR_RECOMMENDATION_STATUS_FILTERS = [
  "active",
  "new",
  "viewed",
  "dismissed",
  "superseded",
  "with-application",
] as const;

export type AdminMonitorRecommendationStatusFilter =
  (typeof ADMIN_MONITOR_RECOMMENDATION_STATUS_FILTERS)[number];

export class ListAdminMonitorRecommendationsDto {
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
  limit?: number;

  @IsOptional()
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsIn(ADMIN_MONITOR_RECOMMENDATION_STATUS_FILTERS)
  status?: AdminMonitorRecommendationStatusFilter;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(5)
  opportunityLevel?: number;
}
