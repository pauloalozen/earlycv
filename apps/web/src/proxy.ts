import type { NextRequest } from "next/server";

// /radar-pub/* é a rota INTERNA em cache do detalhe anônimo (ver
// app/radar-pub/[slug]/page.tsx). Ela só deve ser alcançada pelo rewrite de
// next.config.ts. O proxy roda ANTES dos rewrites e vê a URL pública original
// (/radar/<slug>), então só intercepta acessos DIRETOS a /radar-pub/*: nunca
// contamina a resposta pública (que segue indexável) nem a rota interna
// quando alcançada via rewrite.
function isInternalRadarPubPath(pathname: string) {
  return pathname === "/radar-pub" || pathname.startsWith("/radar-pub/");
}

export function proxy(request: NextRequest) {
  const { pathname } = new URL(request.url);

  if (isInternalRadarPubPath(pathname)) {
    return new Response(null, {
      headers: { "Cache-Control": "no-store" },
      status: 404,
    });
  }

  const redirectUrl = new URL("/", request.url);

  return Response.redirect(redirectUrl, 308);
}

export const config = {
  matcher: ["/jobs", "/jobs/:path*", "/radar-pub", "/radar-pub/:path*"],
};
