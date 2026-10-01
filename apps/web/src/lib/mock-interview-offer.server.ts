import "server-only";

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

// Preço vigente, direto da API (público, sem sessão). Cache de 5 min: a
// landing continua estática/ISR. null = preço não configurado ou API fora;
// as páginas escondem o valor nesse caso (o checkout recusa sozinho).
export async function fetchMockInterviewOffer(): Promise<MockInterviewPublicOffer | null> {
  try {
    const response = await fetch(`${getApiBaseUrl()}/mock-interviews/offer`, {
      next: { revalidate: 300 },
    });
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
