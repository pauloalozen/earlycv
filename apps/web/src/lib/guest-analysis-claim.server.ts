import "server-only";

function getApiBaseUrl() {
  const base =
    process.env.API_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    "http://localhost:4000";
  return base.endsWith("/api") ? base : `${base}/api`;
}

export type ClaimGuestAnalysisJobResult =
  | { status: "succeeded"; cvAdaptationId: string }
  | { status: "pending" | "processing" | "failed" }
  | { status: "error" };

// Server-side, com o accessToken já em mãos (nunca depende de reler cookie
// no meio da mesma requisição — evita qualquer ambiguidade de timing entre
// persistAppSession e uma leitura subsequente via cookies()). Usado pelos
// route handlers de login-user, register-user e social-callback — os três
// pontos onde uma autenticação pode acabar de acontecer com uma análise
// guest pendente.
export async function claimGuestAnalysisJobServerSide(
  accessToken: string,
  jobId: string,
  guestPossessionToken?: string | null,
): Promise<ClaimGuestAnalysisJobResult> {
  try {
    const response = await fetch(
      `${getApiBaseUrl()}/cv-adaptation/analysis-jobs/${jobId}/claim`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        cache: "no-store",
        body: JSON.stringify(
          guestPossessionToken ? { guestPossessionToken } : {},
        ),
      },
    );

    if (!response.ok) {
      return { status: "error" };
    }

    return (await response.json()) as ClaimGuestAnalysisJobResult;
  } catch {
    return { status: "error" };
  }
}

// Nunca quebra o login/cadastro por causa disto — falha/expiração/ausência
// de claim só significa "sem retomada automática", o usuário sempre cai no
// destino padrão e pode iniciar uma análise nova em /adaptar.
export function buildClaimResultDestination(
  result: ClaimGuestAnalysisJobResult,
  jobId: string,
  fallback: string,
): string {
  if (result.status === "succeeded") {
    return `/adaptar/resultado?adaptationId=${result.cvAdaptationId}`;
  }
  if (result.status === "pending" || result.status === "processing") {
    return `/adaptar/resultado?claimJobId=${jobId}`;
  }
  return fallback;
}
