import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { APP_ACCESS_TOKEN_COOKIE_NAME } from "./lib/app-session";
import {
  BACKOFFICE_SESSION_COOKIE_NAME,
  buildBackofficeBootstrapRedirectUrl,
} from "./lib/backoffice-session";

const PROTECTED_PREFIXES = ["/meus-cvs", "/dashboard"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Backoffice bootstrap — token na query string
  const token = request.nextUrl.searchParams.get("token")?.trim();
  if (token) {
    const response = NextResponse.redirect(
      new URL(buildBackofficeBootstrapRedirectUrl(request.url), request.url),
    );
    response.cookies.set({
      httpOnly: true,
      name: BACKOFFICE_SESSION_COOKIE_NAME,
      path: "/",
      sameSite: "lax",
      secure: request.nextUrl.protocol === "https:",
      value: token,
    });
    return response;
  }

  // Proteção de rotas autenticadas
  const isProtected = PROTECTED_PREFIXES.some((prefix) =>
    pathname.startsWith(prefix),
  );
  if (isProtected) {
    const accessToken = request.cookies.get(
      APP_ACCESS_TOKEN_COOKIE_NAME,
    )?.value;
    if (!accessToken) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("next", pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/admin/:path*",
    "/superadmin/:path*",
    "/meus-cvs/:path*",
    "/dashboard/:path*",
  ],
};
