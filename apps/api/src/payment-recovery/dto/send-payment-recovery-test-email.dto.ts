import { IsEmail, MaxLength } from "class-validator";

export class SendPaymentRecoveryTestEmailDto {
  @IsEmail()
  @MaxLength(320)
  email!: string;
}
