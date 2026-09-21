import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

function getApiBaseUrl() {
  const base =
    process.env.API_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    "http://localhost:4000";
  return base.endsWith("/api") ? base : `${base}/api`;
}

// Proxy fino pro preview limitado do Radar (Fase 1 de conversão) — sempre
// guest, nunca autenticado (visitante que já criou conta usa o resultado
// completo via getAnalysisJobStatus, não este endpoint). Só repassa o
// header de posse guest, mesmo padrão de
// api/cv-adaptation/analysis-jobs/[jobId]/route.ts.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const { jobId } = await params;
  const guestPossessionToken = request.headers.get("x-guest-possession-token");

  const apiResponse = await fetch(
    `${getApiBaseUrl()}/cv-adaptation/analysis-jobs/${jobId}/radar-preview`,
    {
      headers: {
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
