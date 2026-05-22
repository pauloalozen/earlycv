import { IsBoolean, IsOptional } from "class-validator";

export class SendPaymentRecoveryEmailDto {
  @IsBoolean()
  @IsOptional()
  forceResend?: boolean;
}
