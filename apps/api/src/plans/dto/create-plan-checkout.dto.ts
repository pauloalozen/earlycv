import { IsIn, IsOptional, IsString, MaxLength } from "class-validator";

export class CreatePlanCheckoutDto {
  @IsIn(["starter", "pro", "turbo"])
  planId!: "starter" | "pro" | "turbo";

  @IsOptional()
  @IsString()
  @MaxLength(64)
  adaptationId?: string;
}
