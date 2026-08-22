"use client";

import { useEffect } from "react";
import { trackEvent } from "@/lib/analytics-tracking";
import {
  getJourneyPreviousRoute,
  getJourneyRouteVisitId,
} from "@/lib/journey-session";
import type { ProductOrigin } from "@/lib/product-origin";

// product_origin determinístico por prefixo exato de previous_route — nunca
// por heurística de hostname/referrer (essas viram só pathname antes de
// chegar aqui, ver sanitizeReferrer em analytics-tracking.ts):
//   - previous_route começa com "/radar" -> "radar" (veio de dentro do Radar)
//   - sem previous_route (1º pageview da sessão) -> "seo_job" (a página de
//     detalhe de vaga é a superfície indexada/SEO do Radar — entrada direta
//     numa vaga específica sem navegação prévia é o padrão de tráfego
//     orgânico)
//   - qualquer outro previous_route interno -> "direct"
function resolveProductOrigin(previousRoute: string | null): ProductOrigin {
  if (previousRoute?.startsWith("/radar")) return "radar";
  if (!previousRoute) return "seo_job";
  return "direct";
}

export function JobDetailViewTracker({ jobId }: { jobId: string }) {
  // biome-ignore lint/correctness/useExhaustiveDependencies: dispara uma vez por mount/routeVisitId, não a cada re-render
  useEffect(() => {
    const routeVisitId = getJourneyRouteVisitId();
    const productOrigin = resolveProductOrigin(getJourneyPreviousRoute());

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
