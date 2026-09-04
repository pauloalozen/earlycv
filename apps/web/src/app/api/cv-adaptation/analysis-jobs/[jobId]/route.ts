import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { getAppSessionTokens } from "@/lib/app-session.server";

function getApiBaseUrl() {
  const base =
    process.env.API_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    "http://localhost:4000";
  return base.endsWith("/api") ? base : `${base}/api`;
}

// Endpoint precisa funcionar tanto pra guest quanto pra usuário logado — o
// dono do job (userId ou guestSessionHash) é resolvido no backend a partir
// do JWT (se houver) e do cookie de sessão de guest, então aqui só repassamos
// o que a requisição do browser já trouxer, sem exigir token.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const { jobId } = await params;
  const { accessToken: token } = await getAppSessionTokens();
  const cookieHeader = request.headers.get("cookie") ?? "";
  // Fase 5: repassa o token de posse guest (Fase 1/2) quando o browser o
  // enviar — só importa para requisição não autenticada com o gate ligado;
  // o backend ignora silenciosamente fora desse caso.
  const guestPossessionToken = request.headers.get("x-guest-possession-token");

  const apiResponse = await fetch(
    `${getApiBaseUrl()}/cv-adaptation/analysis-jobs/${jobId}`,
    {
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(cookieHeader ? { Cookie: cookieHeader } : {}),
        ...(guestPossessionToken
          ? { "x-guest-possession-token": guestPossessionToken }
          : {}),
      },
      cache: "no-store",
    },
  );

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
