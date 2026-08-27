import { IsIn, IsOptional, IsString, MaxLength } from "class-validator";
import {
  SIGNUP_CONVERSION_CONTEXTS,
  type SignupConversionContext,
} from "./register.dto";

// Corpo de POST /auth/oauth-attempts (Fase 3 do gate de autenticação guest).
// guestPossessionToken é o único segredo aqui — trafega uma única vez, em
// HTTPS, no corpo desta requisição, nunca em URL/query string. A partir da
// resposta ({ state }), o token cru deixa de ser necessário.
export class CreateOAuthAttemptDto {
  @IsString()
  @MaxLength(128)
  jobId!: string;

  @IsString()
  @MaxLength(256)
  guestPossessionToken!: string;

  @IsOptional()
  @IsIn(SIGNUP_CONVERSION_CONTEXTS)
  conversionContext?: SignupConversionContext;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  journeySessionInternalId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  visitorId?: string;
}
