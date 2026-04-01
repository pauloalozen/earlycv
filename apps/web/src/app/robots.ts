import type { MetadataRoute } from "next";

import { getAbsoluteUrl, siteConfig } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    host: siteConfig.siteUrl,
    rules: {
      userAgent: "*",
      allow: "/",
    },
    sitemap: getAbsoluteUrl("/sitemap.xml"),
  };
}
