import type { MetadataRoute } from "next";

import { jobs } from "@/lib/jobs";
import { getAbsoluteUrl } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();

  return [
    {
      url: getAbsoluteUrl("/"),
      lastModified,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: getAbsoluteUrl("/ui"),
      lastModified,
      changeFrequency: "monthly",
      priority: 0.2,
    },
    ...jobs.map((job) => ({
      url: getAbsoluteUrl(`/vagas/${job.slug}`),
      lastModified,
      changeFrequency: "daily" as const,
      priority: 0.9,
    })),
  ];
}
