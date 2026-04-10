import { IsIn } from "class-validator";

export class CreatePlanCheckoutDto {
  @IsIn(["starter", "pro", "unlimited"])
  planId!: "starter" | "pro" | "unlimited";
}
