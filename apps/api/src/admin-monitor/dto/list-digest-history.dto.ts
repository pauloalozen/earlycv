import { Transform, Type } from "class-transformer";
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from "class-validator";

export type DigestHistorySourceFilter = "MANUAL" | "AUTOMATIC";

export class ListDigestHistoryDto {
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
  @IsString()
  userQuery?: string;

  @IsOptional()
  @IsIn(["MANUAL", "AUTOMATIC"])
  source?: DigestHistorySourceFilter;
}
