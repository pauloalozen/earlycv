"use client";

import { useEffect } from "react";
import { trackEvent } from "@/lib/analytics-tracking";
import { getJourneyRouteVisitId } from "@/lib/journey-session";

export type RadarViewTrackerProps = {
  radarViewType:
    | "all"
    | "area"
    | "junior"
    | "senior"
    | "remote"
    | "technology"
    | "company";
  area?: string;
  seniority?: string;
  technology?: string;
  remoteFilter?: boolean;
};

// Cobre todas as superfícies de listagem do Radar (/radar, /radar/area/*,
// /radar/junior, /radar/senior, /radar/remotas, /radar/tecnologia/*,
// /radar/empresa/*) — a página de detalhe de vaga (/radar/[slug]) usa
// job_detail_viewed, não este componente.
export function RadarViewTracker({
  radarViewType,
  area,
  seniority,
  technology,
  remoteFilter,
}: RadarViewTrackerProps) {
  // biome-ignore lint/correctness/useExhaustiveDependencies: dispara uma vez por mount (routeVisitId), não a cada re-render de props
  useEffect(() => {
    const routeVisitId = getJourneyRouteVisitId();

    void trackEvent({
      eventName: "radar_view",
      eventVersion: 1,
      idempotencyKey: routeVisitId ? `${routeVisitId}:radar_view` : undefined,
      properties: {
        radar_view_type: radarViewType,
        ...(area ? { area } : {}),
        ...(seniority ? { seniority } : {}),
        ...(technology ? { technology } : {}),
        ...(remoteFilter !== undefined ? { remote_filter: remoteFilter } : {}),
      },
    });
  }, []);

  return null;
}
