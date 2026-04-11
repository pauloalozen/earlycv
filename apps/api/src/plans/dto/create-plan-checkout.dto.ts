import { IsIn } from "class-validator";

export class CreatePlanCheckoutDto {
  @IsIn(["starter", "pro", "turbo"])
  planId!: "starter" | "pro" | "turbo";
}
