import type { Metadata } from "next";

import { getCurrentAppUserFromCookies } from "@/lib/app-session.server";
import { toHeaderAvailableCredits } from "@/lib/header-credits";
import { getMyPlan } from "@/lib/plans-api";
import { getAbsoluteUrl } from "@/lib/site";
import { RadarJobsListing, type RadarSearchParams } from "../jobs-listing";
import { RadarPageShell } from "../page-shell";
import { RadarViewTracker } from "../radar-view-tracker";

export function generateMetadata(): Metadata {
  const url = getAbsoluteUrl("/radar/remotas");

  return {
    title: "Vagas remotas de tecnologia no Brasil | EarlyCV",
    description:
      "Vagas 100% remotas de tecnologia com score de compatibilidade personalizado.",
    alternates: { canonical: url },
  };
}

type PageProps = {
  searchParams: Promise<RadarSearchParams>;
};

export default async function RadarRemotasPage({ searchParams }: PageProps) {
  const user = await getCurrentAppUserFromCookies().catch(() => null);

  const availableCredits = user
    ? toHeaderAvailableCredits(await getMyPlan().catch(() => null))
    : undefined;

  const resolvedSearchParams = await searchParams;

  return (
    <RadarPageShell
      userName={user?.name}
      userRole={user?.internalRole}
      credits={availableCredits}
    >
      <RadarViewTracker radarViewType="remote" remoteFilter={true} />
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
