import { NextResponse } from "next/server";

function getApiBaseUrl() {
  const base =
    process.env.API_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    "http://localhost:4000";
  return base.endsWith("/api") ? base : `${base}/api`;
}

// Único ponto de leitura do gate de autenticação guest pelo frontend
// (specs/no-guest-analysis-preview-auth-gate-diagnostic-plan-ADENDO-hardening.md
// seção 8.2) — o backend continua a autoridade final em todo endpoint que
// importa; isto só decide qual UI mostrar. Sem cache — chamado uma vez por
// carregamento de /adaptar e /adaptar/resultado.
export async function GET() {
  const apiResponse = await fetch(
    `${getApiBaseUrl()}/cv-adaptation/config/public`,
    { cache: "no-store" },
  );

  if (!apiResponse.ok) {
    // Nunca deve travar a UI por causa disso — assume flag desligada
    // (comportamento atual) se a config não puder ser lida.
    return NextResponse.json({ guestAnalysisAuthGateEnabled: false });
  }

  const json = (await apiResponse.json()) as unknown;
  return NextResponse.json(json);
}
