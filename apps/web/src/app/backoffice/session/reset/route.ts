import { NextResponse } from "next/server";

import { BACKOFFICE_SESSION_COOKIE_NAME } from "@/lib/backoffice-session";

const DEFAULT_REDIRECT_PATH = "/admin/ingestion";

function getSafeRedirectPath(next: string | null) {
  if (!next?.startsWith("/")) {
    return DEFAULT_REDIRECT_PATH;
  }

  return next.startsWith("//") ? DEFAULT_REDIRECT_PATH : next;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const next = getSafeRedirectPath(url.searchParams.get("next"));
  const response = NextResponse.redirect(new URL(next, url));

  response.cookies.set({
    httpOnly: true,
    maxAge: 0,
    name: BACKOFFICE_SESSION_COOKIE_NAME,
    path: "/",
    sameSite: "lax",
    secure: url.protocol === "https:",
    value: "",
  });

  return response;
}
