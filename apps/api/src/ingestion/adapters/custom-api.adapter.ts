import { Injectable } from "@nestjs/common";

import type {
  IngestionSourceAdapter,
  JobSourceContext,
  NormalizedJobObservation,
} from "../types";

function slugify(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-");
}

@Injectable()
export class CustomApiAdapter implements IngestionSourceAdapter {
  readonly sourceType = "custom_api" as const;

  async collect(
    jobSource: JobSourceContext,
  ): Promise<NormalizedJobObservation[]> {
    const now = new Date().toISOString();
    const companySlug = slugify(jobSource.company.normalizedName);
    const sourceSlug = slugify(jobSource.sourceName);

    return [
      {
        canonicalKey: `${companySlug}:${sourceSlug}:data-platform-analyst`,
        city: "Campinas",
        country: "Brasil",
        descriptionClean:
          "Analise de qualidade da base de vagas e monitoramento de catalogo.",
        descriptionRaw:
          "Analise de qualidade da base de vagas e monitoramento de catalogo.",
        employmentType: "contractor",
        externalJobId: `${sourceSlug}-api-001`,
        firstSeenAt: now,
        lastSeenAt: now,
        locationText: "Campinas, Brasil",
        normalizedTitle: "data platform analyst",
        publishedAtSource: now,
        seniorityLevel: "pleno",
        sourceJobUrl: `${jobSource.sourceUrl.replace(/\/+$/, "")}/data-platform-analyst`,
        state: "SP",
        status: "active",
        title: "Data Platform Analyst",
        workModel: "onsite",
      },
    ];
  }
}
