import type { MetadataRoute } from "next";

import { isJobsGhostModeEnabled } from "@/lib/jobs-ghost-mode";
import { getAbsoluteUrl, siteConfig } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
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
          "/cv-base",
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
