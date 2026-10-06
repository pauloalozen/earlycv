import { NextResponse } from "next/server";

import { apiRequest } from "@/lib/api-request";

export const dynamic = "force-dynamic";

// Pagamento simulado (modo teste do admin). A API decide se é permitido
// (flag, ambiente, staff, próprio pedido) e responde 404 caso contrário.
export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const response = await apiRequest(
    "POST",
    `/mock-interviews/purchases/${encodeURIComponent(id)}/simulate-payment`,
    {},
  );
  const text = await response.text();
  return new NextResponse(text, {
    status: response.status,
    headers: {
      "content-type":
        response.headers.get("content-type") ?? "application/json",
    },
  });
}
