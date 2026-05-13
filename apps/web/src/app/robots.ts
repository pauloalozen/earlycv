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
        ],
      },
    ],
    sitemap: getAbsoluteUrl("/sitemap.xml"),
  };
}
