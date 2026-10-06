import "server-only";

import { getAppSessionTokens } from "./app-session.server";
import { getMockInterviewMode } from "./mock-interview-mode";

function getApiBaseUrl() {
  const base =
    process.env.API_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    "http://localhost:4000";
  return base.endsWith("/api") ? base : `${base}/api`;
}

export type MockInterviewPublicOffer = {
  amountInCents: number;
  currency: string;
};

// Preço vigente, direto da API. Com a flag em "on" é público e cacheado por
// 5 min (a landing continua estática/ISR). Em "admin" a API só responde para
// staff, então vai com a sessão e sem cache. Em "off" nem consulta. null =
// venda fechada, preço não configurado ou API fora; as páginas escondem o
// valor nesse caso (o checkout recusa sozinho).
export async function fetchMockInterviewOffer(): Promise<MockInterviewPublicOffer | null> {
  const mode = getMockInterviewMode();
  if (mode === "off") return null;
  try {
    let init: RequestInit & { next?: { revalidate: number } } = {
      next: { revalidate: 300 },
    };
    if (mode === "admin") {
      const { accessToken } = await getAppSessionTokens();
      if (!accessToken) return null;
      init = {
        cache: "no-store",
        headers: { Authorization: `Bearer ${accessToken}` },
      };
    }
    const response = await fetch(
      `${getApiBaseUrl()}/mock-interviews/offer`,
      init,
    );
    if (!response.ok) return null;
    const data = (await response.json()) as {
      amountInCents?: unknown;
      currency?: unknown;
    };
    if (typeof data.amountInCents !== "number" || data.amountInCents <= 0) {
      return null;
    }
    return {
      amountInCents: data.amountInCents,
      currency: typeof data.currency === "string" ? data.currency : "BRL",
    };
  } catch {
    return null;
  }
}
