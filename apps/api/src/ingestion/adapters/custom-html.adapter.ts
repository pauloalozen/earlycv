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
export class CustomHtmlAdapter implements IngestionSourceAdapter {
  readonly sourceType = "custom_html" as const;

  async collect(
    jobSource: JobSourceContext,
  ): Promise<NormalizedJobObservation[]> {
    const now = new Date().toISOString();
    const companySlug = slugify(jobSource.company.normalizedName);
    const sourceSlug = slugify(jobSource.sourceName);

    return [
      {
        canonicalKey: `${companySlug}:${sourceSlug}:platform-engineer`,
        city: "Sao Paulo",
        country: "Brasil",
        descriptionClean:
          "Responsavel por evoluir APIs, observabilidade e pipelines internos.",
        descriptionRaw:
          "Responsavel por evoluir APIs, observabilidade e pipelines internos.",
        employmentType: "full_time",
        firstSeenAt: now,
        lastSeenAt: now,
        locationText: "Sao Paulo, Brasil",
        normalizedTitle: "platform engineer",
        publishedAtSource: now,
        seniorityLevel: "pleno",
        sourceJobUrl: `${jobSource.sourceUrl.replace(/\/+$/, "")}/platform-engineer`,
        state: "SP",
        status: "active",
        title: "Platform Engineer",
        workModel: "hybrid",
      },
      {
        canonicalKey: `${companySlug}:${sourceSlug}:backend-engineer`,
        city: "Remoto",
        country: "Brasil",
        descriptionClean:
          "Construcao de servicos de ingestao e distribuicao de dados de vagas.",
        descriptionRaw:
          "Construcao de servicos de ingestao e distribuicao de dados de vagas.",
        employmentType: "full_time",
        firstSeenAt: now,
        lastSeenAt: now,
        locationText: "Remoto - Brasil",
        normalizedTitle: "backend engineer",
        publishedAtSource: now,
        seniorityLevel: "senior",
        sourceJobUrl: `${jobSource.sourceUrl.replace(/\/+$/, "")}/backend-engineer`,
        state: "BR",
        status: "active",
        title: "Backend Engineer",
        workModel: "remote",
      },
    ];
  }
}
