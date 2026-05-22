import { Transform } from "class-transformer";
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from "class-validator";

export class ListPaymentRecoveryDto {
  @IsOptional()
  @IsIn(["eligible", "possibly_resolved", "not_eligible", "all"])
  eligibilityStatus?: "eligible" | "possibly_resolved" | "not_eligible" | "all";

  @IsOptional()
  @IsIn(["unlock_cv", "buy_credits", "all"])
  originAction?: "unlock_cv" | "buy_credits" | "all";

  @IsOptional()
  @IsIn(["true", "false", "all"])
  alreadySent?: "true" | "false" | "all";

  @IsOptional()
  @IsIn(["true", "false", "all"])
  hasAvailableCredits?: "true" | "false" | "all";

  @IsOptional()
  @IsIn(["true", "false", "all"])
  ignored?: "true" | "false" | "all";

  @IsOptional()
  @IsString()
  dateFrom?: string;

  @IsOptional()
  @IsString()
  dateTo?: string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @Transform(({ value }) => Number.parseInt(String(value), 10))
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Transform(({ value }) => Number.parseInt(String(value), 10))
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}
