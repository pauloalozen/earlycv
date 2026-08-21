// Conjunto fechado espelhando SIGNUP_CONVERSION_CONTEXTS do backend
// (apps/api/src/auth/dto/register.dto.ts). O frontend sempre envia um
// valor explícito — nunca deixa o backend inferir a origem do cadastro.
export const SIGNUP_CONVERSION_CONTEXTS = [
  "analysis_guest",
  "checkout",
  "direct_auth",
  "radar",
  "unknown",
] as const;

export type SignupConversionContext =
  (typeof SIGNUP_CONVERSION_CONTEXTS)[number];

export function isSignupConversionContext(
  value: unknown,
): value is SignupConversionContext {
  return (
    typeof value === "string" &&
    (SIGNUP_CONVERSION_CONTEXTS as readonly string[]).includes(value)
  );
}
