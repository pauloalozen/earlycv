import { hasJobIdPrefix, stripJobIdPrefix } from "@earlycv/config/job-display";

import { stripNormalizedJobIdPrefix } from "../ingestion/clean-title";
import { buildPublicJobSlug, toCompanySlug } from "./public-job-view";

export type SlugRegenerationReason = "job_id_prefix" | "company_changed";

export type SlugRegenerationInput = {
  companyName: string;
  id: string;
  normalizedTitle: string;
  slug: string;
  title: string;
};

export type SlugRegenerationPlan = {
  baseSlug: string;
  normalizedTitle: string;
  reasons: SlugRegenerationReason[];
  title: string;
};

// Decisão A do PR 2b (restrita): o slug só é regenerado quando está errado
// de fato, nunca porque o título mudou na fonte. Dois casos:
// - título com o ID interno do ATS ("[Job-32186] ...", Lever da CI&T),
//   detectado pelo título ou pelo slug (a ingestão já grava o título limpo,
//   então numa vaga recrawleada só o slug ainda carrega "job-32186-");
// - vaga cuja empresa foi reatribuída: o trecho da empresa no slug não bate
//   mais com Company.name.
// A URL antiga continua chegando à vaga pelo cuid no fim do slug (308).
export function planSlugRegeneration(
  job: SlugRegenerationInput,
): SlugRegenerationPlan | null {
  const titleHasPrefix = hasJobIdPrefix(job.title);
  const title = titleHasPrefix ? stripJobIdPrefix(job.title) : job.title;
  const reasons: SlugRegenerationReason[] = [];

  if (titleHasPrefix || /^job-\d+-/.test(job.slug)) {
    reasons.push("job_id_prefix");
  }

  const safeId = job.id.replace(/[^a-zA-Z0-9-]/g, "-");
  const currentBase = job.slug.replace(/_\d+$/, "");
  if (!currentBase.endsWith(`-${toCompanySlug(job.companyName)}-${safeId}`)) {
    reasons.push("company_changed");
  }

  if (reasons.length === 0) return null;

  const baseSlug = buildPublicJobSlug(job.id, title, job.companyName);
  if (baseSlug === currentBase && title === job.title) return null;

  return {
    baseSlug,
    normalizedTitle:
      title === job.title
        ? job.normalizedTitle
        : stripNormalizedJobIdPrefix(job.normalizedTitle),
    reasons,
    title,
  };
}
