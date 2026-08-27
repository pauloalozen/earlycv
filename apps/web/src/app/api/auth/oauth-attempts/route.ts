import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

function getApiBaseUrl() {
  const base =
    process.env.API_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    "http://localhost:4000";
  return base.endsWith("/api") ? base : `${base}/api`;
}

// Fase 5 do gate de autenticação guest — cria a tentativa de OAuth (Fase 3,
// apps/api/src/auth/oauth-attempt.service.ts) antes do redirect pro Google.
// guestPossessionToken cru trafega uma única vez aqui, em HTTPS, nunca em
// URL — depois desta chamada deixa de ser necessário (o browser só guarda o
// `state` opaco devolvido).
export async function POST(request: NextRequest) {
  const body = await request.text();

  const apiResponse = await fetch(`${getApiBaseUrl()}/auth/oauth-attempts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body,
  });

  if (!apiResponse.ok) {
    const error = await apiResponse.text();
    return NextResponse.json(
      { message: error },
      { status: apiResponse.status },
    );
  }

  const json = (await apiResponse.json()) as unknown;
  return NextResponse.json(json);
}
