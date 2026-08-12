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
  const url = getAbsoluteUrl("/radar/remotas");

  return {
    title: "Vagas remotas de tecnologia no Brasil | EarlyCV",
    description:
      "Vagas 100% remotas de tecnologia com score de compatibilidade personalizado.",
    alternates: { canonical: url },
    robots: { index: !isGhostMode, follow: !isGhostMode },
  };
}

type PageProps = {
  searchParams: Promise<RadarSearchParams>;
};

export default async function RadarRemotasPage({ searchParams }: PageProps) {
  const isGhostMode = isJobsGhostModeEnabled();
  const user = await getCurrentAppUserFromCookies().catch(() => null);

  if (isGhostMode && !canAccessJobsInGhostMode(user?.internalRole)) {
    notFound();
  }

  const resolvedSearchParams = await searchParams;

  return (
    <RadarPageShell>
      <RadarJobsListing
        basePath="/radar/remotas"
        user={user}
        searchParams={resolvedSearchParams}
        // "remote" (não "REMOTE") — workModel é string livre, não enum, e
        // os valores reais no banco são lowercase (ver geo/workModel nos
        // adapters de ingestão).
        fixedFilters={{ workModel: "remote" }}
        landingHeader={{
          eyebrow: "PORTAL DE VAGAS",
          title: "Vagas remotas de tecnologia",
          description:
            "Encontre as melhores vagas 100% remotas e analise seu CV gratuitamente.",
        }}
      />
    </RadarPageShell>
  );
}
