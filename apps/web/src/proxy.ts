import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import {
  BACKOFFICE_SESSION_COOKIE_NAME,
  buildBackofficeBootstrapRedirectUrl,
} from "./lib/backoffice-session";

export function proxy(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token")?.trim();

  if (!token) {
    return NextResponse.next();
  }

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

export const config = {
  matcher: ["/admin/:path*", "/superadmin/:path*"],
};
