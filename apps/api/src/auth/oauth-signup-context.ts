import type { NextFunction, Request, Response } from "express";
import {
  SIGNUP_CONVERSION_CONTEXTS,
  type SignupConversionContext,
} from "./dto/register.dto";

// Preserva conversion_context e sessionInternalId durante o round-trip do
// OAuth (start -> Google -> callback) sem colocar nada disso na URL de
// callback e sem depender de cookie compartilhado entre domínios: as
// cookies são setadas e lidas inteiramente pela própria API, no path
// /api/auth/google. Os valores são validados contra formato/enum fechado
// em ambas as pontas — nunca inferidos; adulteração ou ausência só
// resulta em "unknown" (contexto) ou null (sessionInternalId), nunca
// quebra o login.
export const OAUTH_SIGNUP_CONTEXT_COOKIE = "oauth_signup_ctx";
export const OAUTH_JOURNEY_SESSION_COOKIE = "oauth_journey_sid";
const OAUTH_COOKIE_PATH = "/api/auth/google";
// Mesmo TTL pros dois — é o mesmo round-trip OAuth, mesma janela de
// exposição.
const OAUTH_COOKIE_MAX_AGE_MS = 10 * 60 * 1000;

// Mesmo formato que o frontend gera em buildSessionInternalId()
// (apps/web/src/lib/analytics-tracking.ts): crypto.randomUUID() ou, no
// fallback sem crypto.randomUUID, `journey-${Date.now()}`.
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const JOURNEY_FALLBACK_PATTERN = /^journey-[0-9]{10,20}$/;
const MAX_SESSION_INTERNAL_ID_LENGTH = 128;

function isSignupConversionContext(
  value: unknown,
): value is SignupConversionContext {
  return (
    typeof value === "string" &&
    (SIGNUP_CONVERSION_CONTEXTS as readonly string[]).includes(value)
  );
}

function isValidJourneySessionInternalId(value: unknown): value is string {
  if (typeof value !== "string") return false;
  if (value.length === 0 || value.length > MAX_SESSION_INTERNAL_ID_LENGTH) {
    return false;
  }
  return UUID_PATTERN.test(value) || JOURNEY_FALLBACK_PATTERN.test(value);
}

function firstQueryValue(value: unknown): unknown {
  return Array.isArray(value) ? value[0] : value;
}

export function captureOAuthSignupContextMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const ctxValue = firstQueryValue(req.query.ctx);
  if (isSignupConversionContext(ctxValue)) {
    res.cookie(OAUTH_SIGNUP_CONTEXT_COOKIE, ctxValue, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: OAUTH_COOKIE_MAX_AGE_MS,
      path: OAUTH_COOKIE_PATH,
    });
  }

  const sidValue = firstQueryValue(req.query.sid);
  if (isValidJourneySessionInternalId(sidValue)) {
    res.cookie(OAUTH_JOURNEY_SESSION_COOKIE, sidValue, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: OAUTH_COOKIE_MAX_AGE_MS,
      path: OAUTH_COOKIE_PATH,
    });
  }

  next();
}

function parseCookieHeader(header: string | undefined): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!header) return cookies;

  for (const pair of header.split(";")) {
    const separatorIndex = pair.indexOf("=");
    if (separatorIndex <= 0) continue;
    const key = pair.slice(0, separatorIndex).trim();
    const value = pair.slice(separatorIndex + 1).trim();
    if (key.length === 0 || value.length === 0) continue;
    cookies[key] = value;
  }

  return cookies;
}

function readRawCookie(req: Request, cookieName: string): string | undefined {
  const cookies: Record<string, unknown> =
    req.cookies && typeof req.cookies === "object" ? req.cookies : {};
  const fromParsedCookies = cookies[cookieName];

  if (typeof fromParsedCookies === "string") {
    return fromParsedCookies;
  }

  return parseCookieHeader(req.headers.cookie)[cookieName];
}

function decodeCookieValue(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  try {
    return decodeURIComponent(raw);
  } catch {
    return undefined;
  }
}

export function readAndClearOAuthSignupContext(
  req: Request,
  res: Response,
): SignupConversionContext {
  const decoded = decodeCookieValue(
    readRawCookie(req, OAUTH_SIGNUP_CONTEXT_COOKIE),
  );

  res.cookie(OAUTH_SIGNUP_CONTEXT_COOKIE, "", {
    maxAge: 0,
    path: OAUTH_COOKIE_PATH,
  });

  return isSignupConversionContext(decoded) ? decoded : "unknown";
}

export function readAndClearOAuthJourneySessionId(
  req: Request,
  res: Response,
): string | null {
  const decoded = decodeCookieValue(
    readRawCookie(req, OAUTH_JOURNEY_SESSION_COOKIE),
  );

  res.cookie(OAUTH_JOURNEY_SESSION_COOKIE, "", {
    maxAge: 0,
    path: OAUTH_COOKIE_PATH,
  });

  return isValidJourneySessionInternalId(decoded) ? decoded : null;
}
