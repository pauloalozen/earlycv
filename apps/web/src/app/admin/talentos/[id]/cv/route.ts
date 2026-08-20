import { NextResponse } from "next/server";

import { resolveTalentProfileCvSource } from "@/lib/admin-talent-profiles-api";
import { getBackofficeSessionToken } from "@/lib/backoffice-session.server";

export const dynamic = "force-dynamic";

// Proxy fino: resolve o CV de verdade via API admin (Resume master do
// usuário, ou o AnalysisCvSnapshot que originou o profile) e ou redireciona
// pra URL assinada do arquivo (S3), ou devolve o texto direto quando a
// fonte é o Resume master (que não tem arquivo próprio, só texto no banco).
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const token = await getBackofficeSessionToken();
  if (!token) {
    return new NextResponse("Não autenticado.", { status: 401 });
  }

  try {
    const source = await resolveTalentProfileCvSource(id, token);

    if (source.kind === "url") {
      return NextResponse.redirect(source.url);
    }

    if (source.kind === "text") {
      return new NextResponse(source.text, {
        headers: { "content-type": "text/markdown; charset=utf-8" },
      });
    }

    return new NextResponse("Nenhum CV disponível para este perfil.", {
      status: 404,
    });
  } catch {
    return new NextResponse("Falha ao resolver o CV.", { status: 502 });
  }
}
