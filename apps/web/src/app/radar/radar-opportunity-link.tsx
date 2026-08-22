"use client";

import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { trackEvent } from "@/lib/analytics-tracking";
import { writeRadarJobNavigationContext } from "@/lib/journey-session";

// Link clicável pra uma vaga específica do Radar (listagem principal,
// carrossel de vagas similares na listagem, carrossel de vagas similares
// no detalhe) — emite radar_opportunity_clicked antes da navegação.
// Cliques distintos são ações reais: nunca deduplicado globalmente, cada
// clique gera um evento novo.
export function RadarOpportunityLink({
  href,
  jobId,
  position,
  activeFilters,
  style,
  className,
  children,
}: {
  href: string;
  jobId: string;
  position?: number;
  activeFilters?: Record<string, string | boolean | undefined>;
  style?: CSSProperties;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      style={style}
      className={className}
      onClick={() => {
        writeRadarJobNavigationContext(jobId);
        void trackEvent({
          eventName: "radar_opportunity_clicked",
          eventVersion: 1,
          properties: {
            job_id: jobId,
            product_origin: "radar",
            ...(position !== undefined ? { position } : {}),
            ...(activeFilters ? { active_filters: activeFilters } : {}),
          },
        });
      }}
    >
      {children}
    </Link>
  );
}
