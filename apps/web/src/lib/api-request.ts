import "server-only";

import { cookies } from "next/headers";

import { APP_ACCESS_TOKEN_COOKIE_NAME } from "./app-session";

function getApiBaseUrl() {
  const base =
    process.env.API_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    "http://localhost:4000";

  return base.endsWith("/api") ? base : `${base}/api`;
}

// x-session-internal-id: mesmo header lido por requestContextMiddleware na
// API (ver apps/api/src/common/journey-session-id.ts) — carrega o UUID de
// jornada do frontend pra correlacionar eventos backend de produto com a
// classificação de sessão (new/existing/anonymous). Passar só quando o
// chamador já leu um valor confiável de sessionStorage — nunca inventar.
const JOURNEY_SESSION_ID_HEADER = "x-session-internal-id";

export async function apiRequest(
  method: string,
  path: string,
  body?: FormData | Record<string, unknown>,
  timeoutMs = 180_000,
  sessionInternalId?: string | null,
): Promise<Response> {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get(APP_ACCESS_TOKEN_COOKIE_NAME)?.value;

  const url = `${getApiBaseUrl()}${path}`;

  const headers: Record<string, string> = {};
  const cookieHeader = cookieStore.toString();

  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  if (sessionInternalId) {
    headers[JOURNEY_SESSION_ID_HEADER] = sessionInternalId;
  }

  if (cookieHeader) {
    headers.Cookie = cookieHeader;
  }

  if (!(body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }

  const options: RequestInit = {
    method,
    headers,
    cache: "no-store",
  };

  if (body) {
    options.body = body instanceof FormData ? body : JSON.stringify(body);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}
