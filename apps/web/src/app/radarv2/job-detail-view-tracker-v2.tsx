"use client";

import { useEffect } from "react";
import { trackEvent } from "@/lib/analytics-tracking";
import {
  getJourneyRouteVisitId,
  resolveJobProductOrigin,
} from "@/lib/journey-session";

// Espelho de radar/job-detail-view-tracker.tsx (v1), só com page_variant
// adicional pra permitir segmentar o funil entre a versão em produção e
// esta variante de comparação — nunca toca no tracker de v1, que continua
// sem essa propriedade.
export function JobDetailViewTrackerV2({ jobId }: { jobId: string }) {
  // biome-ignore lint/correctness/useExhaustiveDependencies: dispara uma vez por mount/routeVisitId, não a cada re-render
  useEffect(() => {
    const routeVisitId = getJourneyRouteVisitId();
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
        page_variant: "v2",
      },
    });
  }, []);

  return null;
}
