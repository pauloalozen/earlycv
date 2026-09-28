import { IsOptional, IsString, MaxLength } from "class-validator";

export class CouponVisitDto {
  @IsString()
  @MaxLength(64)
  couponCode!: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  visitorId?: string;
}
