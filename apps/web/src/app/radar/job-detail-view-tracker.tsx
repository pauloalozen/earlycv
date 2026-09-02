"use client";

import { useEffect } from "react";
import { trackEvent } from "@/lib/analytics-tracking";
import {
  getJourneyRouteVisitId,
  resolveJobProductOrigin,
} from "@/lib/journey-session";

export function JobDetailViewTracker({ jobId }: { jobId: string }) {
  // biome-ignore lint/correctness/useExhaustiveDependencies: dispara uma vez por mount/routeVisitId, não a cada re-render
  useEffect(() => {
    const routeVisitId = getJourneyRouteVisitId();
    // resolveJobProductOrigin (journey-session.ts) é a fonte única desta
    // resolução — prioriza o marcador síncrono do clique (escopado a este
    // jobId) sobre previousRoute, que é escrito pelo JourneyTrackerProvider
    // de forma assíncrona e pode ainda não refletir a navegação atual
    // quando este efeito roda. Mesma função usada pelo botão de salvar
    // vaga, pra garantir que os dois concordem sobre a mesma navegação.
    const productOrigin = resolveJobProductOrigin(jobId);

    void trackEvent({
      eventName: "job_detail_viewed",
      eventVersion: 1,
      idempotencyKey: routeVisitId
        ? `${routeVisitId}:job_detail_viewed`
        : undefined,
      properties: {
        job_id: jobId,
        product_origin: productOrigin,
      },
    });
  }, []);

  return null;
}
