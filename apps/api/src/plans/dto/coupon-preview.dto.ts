import { IsIn, IsString, MaxLength } from "class-validator";

export class CouponPreviewDto {
  @IsIn(["starter", "pro", "turbo"])
  planId!: "starter" | "pro" | "turbo";

  @IsString()
  @MaxLength(64)
  couponCode!: string;
}
