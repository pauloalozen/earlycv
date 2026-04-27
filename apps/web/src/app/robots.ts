import type { MetadataRoute } from "next";

import { getAbsoluteUrl, siteConfig } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    host: siteConfig.siteUrl,
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/dashboard",
          "/adaptar",
          "/cv-base",
          "/admin",
          "/superadmin",
          "/backoffice",
          "/entrar",
          "/verificar-email",
          "/esqueceu-senha",
          "/redefinir-senha",
          "/pagamento",
          "/plans/",
          "/api/",
          "/auth/",
        ],
      },
    ],
    sitemap: getAbsoluteUrl("/sitemap.xml"),
  };
}
