import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getCurrentAppUserFromCookies } from "@/lib/app-session.server";
import {
  canAccessJobsInGhostMode,
  isJobsGhostModeEnabled,
} from "@/lib/jobs-ghost-mode";
import { getAbsoluteUrl } from "@/lib/site";
import { RadarJobsListing, type RadarSearchParams } from "../jobs-listing";
import { RadarPageShell } from "../page-shell";

export function generateMetadata(): Metadata {
  const isGhostMode = isJobsGhostModeEnabled();
  const url = getAbsoluteUrl("/radar/senior");

  return {
    title: "Vagas sênior de tecnologia no Brasil | EarlyCV",
    description:
      "Vagas sênior de tecnologia com score de compatibilidade personalizado. Analise seu CV gratuitamente.",
    alternates: { canonical: url },
    robots: { index: !isGhostMode, follow: !isGhostMode },
  };
}

type PageProps = {
  searchParams: Promise<RadarSearchParams>;
};

export default async function RadarSeniorPage({ searchParams }: PageProps) {
  const isGhostMode = isJobsGhostModeEnabled();
  const user = await getCurrentAppUserFromCookies().catch(() => null);

  if (isGhostMode && !canAccessJobsInGhostMode(user?.internalRole)) {
    notFound();
  }

  const resolvedSearchParams = await searchParams;

  return (
    <RadarPageShell>
      <RadarJobsListing
        basePath="/radar/senior"
        user={user}
        searchParams={resolvedSearchParams}
        fixedFilters={{ seniority: "SENIOR" }}
        landingHeader={{
          eyebrow: "PORTAL DE VAGAS",
          title: "Vagas sênior de tecnologia",
          description:
            "Encontre as melhores vagas de nível sênior e analise seu CV gratuitamente.",
        }}
      />
    </RadarPageShell>
  );
}
