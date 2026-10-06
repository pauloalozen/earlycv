import { NextResponse } from "next/server";

import { apiRequest } from "@/lib/api-request";

export const dynamic = "force-dynamic";

// Sessões de entrevista simulada agendadas do usuário (sininho do header).
// Falha vira lista vazia: o sininho nunca quebra o header.
export async function GET() {
  try {
    const response = await apiRequest("GET", "/mock-interviews/upcoming");
    if (!response.ok) return NextResponse.json({ items: [] });
    const data = (await response.json()) as {
      items?: { id: string; scheduledAt: string }[];
    };
    return NextResponse.json({ items: data.items ?? [] });
  } catch {
    return NextResponse.json({ items: [] });
  }
}
