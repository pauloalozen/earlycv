import "server-only";

import { cookies } from "next/headers";

import {
  APP_ACCESS_TOKEN_COOKIE_NAME,
  APP_REFRESH_TOKEN_COOKIE_NAME,
  type AppSessionUser,
} from "./app-session";

type AuthSessionResponse = {
  accessToken: string;
  refreshToken: string;
  user: AppSessionUser;
};

function getApiBaseUrl() {
  const configuredBaseUrl =
    process.env.API_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    "http://localhost:4000";

  return configuredBaseUrl.endsWith("/api")
    ? configuredBaseUrl
    : `${configuredBaseUrl}/api`;
}

function buildCookieOptions() {
  return {
    httpOnly: true,
    path: "/",
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
  };
}

export async function getAppSessionTokens() {
  const cookieStore = await cookies();

  return {
    accessToken: cookieStore.get(APP_ACCESS_TOKEN_COOKIE_NAME)?.value ?? null,
    refreshToken: cookieStore.get(APP_REFRESH_TOKEN_COOKIE_NAME)?.value ?? null,
  };
}

export async function persistAppSession(session: AuthSessionResponse) {
  const cookieStore = await cookies();
  const options = buildCookieOptions();

  cookieStore.set(APP_ACCESS_TOKEN_COOKIE_NAME, session.accessToken, options);
  cookieStore.set(APP_REFRESH_TOKEN_COOKIE_NAME, session.refreshToken, options);
}

export async function clearAppSession() {
  const cookieStore = await cookies();

  cookieStore.delete(APP_ACCESS_TOKEN_COOKIE_NAME);
  cookieStore.delete(APP_REFRESH_TOKEN_COOKIE_NAME);
}

export async function fetchCurrentAppUser(accessToken: string) {
  const response = await fetch(`${getApiBaseUrl()}/auth/me`, {
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    return null;
  }

  return (await response.json()) as AppSessionUser;
}

export async function refreshAppSession(refreshToken: string) {
  const response = await fetch(`${getApiBaseUrl()}/auth/refresh`, {
    body: JSON.stringify({ refreshToken }),
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
    },
    method: "POST",
  });

  if (!response.ok) {
    return null;
  }

  const session = (await response.json()) as AuthSessionResponse;

  await persistAppSession(session);

  return session;
}

export async function getCurrentAppSession() {
  const { accessToken, refreshToken } = await getAppSessionTokens();

  if (accessToken) {
    const user = await fetchCurrentAppUser(accessToken);

    if (user) {
      return { accessToken, refreshToken, user };
    }
  }

  if (!refreshToken) {
    return null;
  }

  const refreshed = await refreshAppSession(refreshToken);

  if (!refreshed) {
    await clearAppSession();
    return null;
  }

  return refreshed;
}

export async function getCurrentAppUserFromCookies() {
  const { accessToken } = await getAppSessionTokens();

  if (!accessToken) {
    return null;
  }

  return fetchCurrentAppUser(accessToken);
}
