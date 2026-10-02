import { Type } from "class-transformer";
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from "class-validator";

export const MOCK_INTERVIEW_SESSION_STATUSES = [
  "AWAITING_SCHEDULING",
  "SCHEDULED",
  "COMPLETED",
  "NO_SHOW",
  "CANCELLED",
  "REFUNDED",
] as const;

export class AdminListMockInterviewsQueryDto {
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
  @IsIn(["paid", "refunded", "pending", "all"])
  payment?: "paid" | "refunded" | "pending" | "all";

  @IsOptional()
  @IsIn(MOCK_INTERVIEW_SESSION_STATUSES)
  session?: (typeof MOCK_INTERVIEW_SESSION_STATUSES)[number];

  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;
}
