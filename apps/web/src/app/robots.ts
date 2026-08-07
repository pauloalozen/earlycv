import type { MetadataRoute } from "next";

import { isJobsGhostModeEnabled } from "@/lib/jobs-ghost-mode";
import { getAbsoluteUrl, siteConfig } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  // Ghost mode ligado: /vagas e /vagas/[slug] ficam de fora do crawler
  // (Disallow), a página faz notFound() pra quem não é admin, e
  // generateMetadata() das duas rotas seta robots.index/follow: false —
  // três camadas do mesmo controle. Ghost mode desligado: nenhuma dessas
  // duas entradas de Disallow aparece e o Radar fica indexável.
  const isGhostMode = isJobsGhostModeEnabled();

  return {
    host: siteConfig.siteUrl,
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/dashboard",
          "/meu-perfil",
          "/admin",
          "/admin/*",
          "/superadmin",
          "/superadmin/*",
          "/backoffice",
          "/entrar",
          "/verificar-email",
          "/esqueceu-senha",
          "/redefinir-senha",
          "/pagamento",
          "/api/",
          "/auth/",
          ...(isGhostMode ? ["/vagas", "/vagas/*"] : []),
        ],
      },
    ],
    sitemap: getAbsoluteUrl("/sitemap.xml"),
  };
}
