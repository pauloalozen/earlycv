import { hasJobIdPrefix, stripJobIdPrefix } from "@earlycv/config/job-display";

import type { NormalizedJobObservation } from "./types";

// "[Job-32186] Senior AI Developer" (Lever da CI&T): o ID interno do ATS
// não é parte do cargo. Sai do título e do normalizedTitle antes de gravar,
// para não chegar ao slug nem ao filtro de duplicidade de conteúdo.
export function withCleanTitle(
  observation: NormalizedJobObservation,
): NormalizedJobObservation {
  if (!hasJobIdPrefix(observation.title)) return observation;
  return {
    ...observation,
    normalizedTitle: stripNormalizedJobIdPrefix(observation.normalizedTitle),
    title: stripJobIdPrefix(observation.title),
  };
}

export function stripNormalizedJobIdPrefix(normalizedTitle: string): string {
  return normalizedTitle.replace(/^\[?\s*job\s*-?\s*\d+\s*\]?\s*/i, "").trim();
}
