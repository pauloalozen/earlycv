import { Type } from "class-transformer";
import { IsBoolean, IsIn, IsInt, IsOptional, Max, Min } from "class-validator";

const KINDS = [
  "WELCOME",
  "FEEDBACK_FIRST_USE",
  "PURCHASE_CONFIRMATION",
] as const;
const STATUSES = [
  "PENDING",
  "PROCESSING",
  "SENT",
  "FAILED",
  "OUTCOME_UNKNOWN",
  "SKIPPED",
  "CANCELLED",
] as const;

export class ListEmailDispatchesQueryDto {
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

  // "relationship" = WELCOME + FEEDBACK_FIRST_USE; "purchase" = PURCHASE_CONFIRMATION.
  @IsOptional()
  @IsIn(["relationship", "purchase"])
  group?: "relationship" | "purchase";

  @IsOptional()
  @IsIn(KINDS)
  kind?: (typeof KINDS)[number];

  @IsOptional()
  @IsIn(STATUSES)
  status?: (typeof STATUSES)[number];

  // Envios de teste explícito (isTest) ficam de fora por padrão.
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  includeTest?: boolean;
}
