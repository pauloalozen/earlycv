import { IsIn, IsString, MaxLength } from "class-validator";

export class RedeemFreeCouponDto {
  @IsIn(["starter", "pro", "turbo"])
  planId!: "starter" | "pro" | "turbo";

  @IsString()
  @MaxLength(64)
  couponCode!: string;
}
