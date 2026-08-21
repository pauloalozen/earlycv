import { Transform } from "class-transformer";
import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from "class-validator";

import {
  USER_PASSWORD_POLICY_MESSAGE,
  USER_PASSWORD_POLICY_REGEX,
} from "./password-policy";

// Conjunto fechado — o frontend envia explicitamente qual desses contextos
// se aplica. O backend nunca infere origem por heurística (rota, referrer
// etc.); ausência ou valor inválido colapsa para "unknown".
export const SIGNUP_CONVERSION_CONTEXTS = [
  "analysis_guest",
  "checkout",
  "direct_auth",
  "radar",
  "unknown",
] as const;

export type SignupConversionContext =
  (typeof SIGNUP_CONVERSION_CONTEXTS)[number];

export class RegisterDto {
  @Transform(({ value }) =>
    typeof value === "string" ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  @Matches(USER_PASSWORD_POLICY_REGEX, {
    message: USER_PASSWORD_POLICY_MESSAGE,
  })
  password!: string;

  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @MinLength(2)
  name!: string;

  @IsOptional()
  @IsIn(SIGNUP_CONVERSION_CONTEXTS)
  conversionContext?: SignupConversionContext;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  sessionInternalId?: string;
}
