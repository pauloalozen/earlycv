import { NextResponse } from "next/server";
import { clearAppSession, getAppSessionTokens } from "@/lib/app-session.server";
import { logoutWithRefreshToken } from "@/lib/auth-api";

export async function POST(request: Request) {
  const { refreshToken } = await getAppSessionTokens();

  if (refreshToken) {
    try {
      await logoutWithRefreshToken(refreshToken);
    } catch {}
  }

  await clearAppSession();

  return NextResponse.redirect(new URL("/login", request.url));
}
