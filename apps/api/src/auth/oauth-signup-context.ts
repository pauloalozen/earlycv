import type { NextFunction, Request, Response } from "express";
import {
  SIGNUP_CONVERSION_CONTEXTS,
  type SignupConversionContext,
} from "./dto/register.dto";

// Preserva o conversion_context (ex.: "analysis_guest") durante o
// round-trip do OAuth (start -> Google -> callback) sem colocar nada na
// URL de callback e sem depender de cookie compartilhado entre domínios:
// a cookie é setada e lida inteiramente pela própria API, no path
// /api/auth/google. O valor é validado contra o conjunto fechado em
// ambas as pontas — nunca inferido, e tentativa de adulteração só
// resulta em "unknown".
export const OAUTH_SIGNUP_CONTEXT_COOKIE = "oauth_signup_ctx";
const OAUTH_SIGNUP_CONTEXT_COOKIE_PATH = "/api/auth/google";
const OAUTH_SIGNUP_CONTEXT_MAX_AGE_MS = 10 * 60 * 1000;

function isSignupConversionContext(
  value: unknown,
): value is SignupConversionContext {
  return (
    typeof value === "string" &&
    (SIGNUP_CONVERSION_CONTEXTS as readonly string[]).includes(value)
  );
}

export function captureOAuthSignupContextMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const candidate = req.query.ctx;
  const value = Array.isArray(candidate) ? candidate[0] : candidate;

  if (isSignupConversionContext(value)) {
    res.cookie(OAUTH_SIGNUP_CONTEXT_COOKIE, value, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: OAUTH_SIGNUP_CONTEXT_MAX_AGE_MS,
      path: OAUTH_SIGNUP_CONTEXT_COOKIE_PATH,
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

export function readAndClearOAuthSignupContext(
  req: Request,
  res: Response,
): SignupConversionContext {
  const cookies: Record<string, unknown> =
    req.cookies && typeof req.cookies === "object" ? req.cookies : {};
  const fromParsedCookies = cookies[OAUTH_SIGNUP_CONTEXT_COOKIE];
  const raw =
    typeof fromParsedCookies === "string"
      ? fromParsedCookies
      : parseCookieHeader(req.headers.cookie)[OAUTH_SIGNUP_CONTEXT_COOKIE];

  res.cookie(OAUTH_SIGNUP_CONTEXT_COOKIE, "", {
    maxAge: 0,
    path: OAUTH_SIGNUP_CONTEXT_COOKIE_PATH,
  });

  let decoded: string | undefined;
  try {
    decoded = raw ? decodeURIComponent(raw) : undefined;
  } catch {
    decoded = undefined;
  }

  return isSignupConversionContext(decoded) ? decoded : "unknown";
}
