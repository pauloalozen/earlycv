import { NextResponse } from "next/server";
import {
  APP_ACCESS_TOKEN_COOKIE_NAME,
  APP_REFRESH_TOKEN_COOKIE_NAME,
} from "@/lib/app-session";
import {
  clearAppSession,
  getCurrentAppSession,
} from "@/lib/app-session.server";

function getApiBaseUrl() {
  const base =
    process.env.API_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    "http://localhost:4000";
  return base.endsWith("/api") ? base : `${base}/api`;
}

export async function POST() {
  const session = await getCurrentAppSession();
  if (!session?.accessToken) {
    return NextResponse.json({ message: "Sessao expirada." }, { status: 401 });
  }

  try {
    const response = await fetch(`${getApiBaseUrl()}/auth/me`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${session.accessToken}` },
      cache: "no-store",
    });

    if (!response.ok) {
      return NextResponse.json(
        {
          message: "Nao foi possivel excluir sua conta agora. Tente novamente.",
        },
        { status: response.status },
      );
    }

    await clearAppSession();
    const nextResponse = NextResponse.json({ ok: true });
    nextResponse.cookies.delete(APP_ACCESS_TOKEN_COOKIE_NAME);
    nextResponse.cookies.delete(APP_REFRESH_TOKEN_COOKIE_NAME);
    return nextResponse;
  } catch {
    return NextResponse.json(
      { message: "Nao foi possivel excluir sua conta agora. Tente novamente." },
      { status: 500 },
    );
  }
}
