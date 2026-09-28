import { IsOptional, IsString, MaxLength } from "class-validator";

export class ApplyCheckoutCouponDto {
  @IsOptional()
  @IsString()
  @MaxLength(40)
  couponCode?: string;
}
