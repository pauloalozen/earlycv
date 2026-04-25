import { IsIn, IsOptional, IsUUID } from "class-validator";

export class CreatePlanCheckoutDto {
  @IsIn(["starter", "pro", "turbo"])
  planId!: "starter" | "pro" | "turbo";

  @IsOptional()
  @IsUUID()
  adaptationId?: string;
}
