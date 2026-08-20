import { NextResponse } from "next/server";

import { getTalentProfileCvUrl } from "@/lib/admin-talent-profiles-api";
import { getBackofficeSessionToken } from "@/lib/backoffice-session.server";

export const dynamic = "force-dynamic";

// Proxy fino: resolve a URL assinada do CV (S3) via API admin e redireciona
// pra ela — evita expor o bearer token do backoffice num link clicável.
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
    const { url } = await getTalentProfileCvUrl(id, token);
    if (!url) {
      return new NextResponse("Nenhum CV disponível para este perfil.", {
        status: 404,
      });
    }
    return NextResponse.redirect(url);
  } catch {
    return new NextResponse("Falha ao resolver o CV.", { status: 502 });
  }
}
