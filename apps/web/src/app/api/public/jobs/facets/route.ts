import { type NextRequest, NextResponse } from "next/server";

import { getPublicJobFacets } from "@/lib/public-jobs-api";

export const dynamic = "force-dynamic";

// Proxy client-fetchable pra getPublicJobFacets (server-only) — usado pelo
// FiltersBar pra escopar as cidades pro(s) estado(s) ainda pendente (não
// aplicado), sem esperar a navegação completa que recarrega a página.
export async function GET(request: NextRequest) {
  const state = request.nextUrl.searchParams.get("state") ?? undefined;

  try {
    const facets = await getPublicJobFacets({ state });
    return NextResponse.json(facets, {
      headers: {
        "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "failed to load facets" },
      { status: 502 },
    );
  }
}
