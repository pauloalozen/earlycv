import type { Metadata } from "next";

import { getCurrentAppUserFromCookies } from "@/lib/app-session.server";
import { toHeaderAvailableCredits } from "@/lib/header-credits";
import { getMyPlan } from "@/lib/plans-api";
import { getAbsoluteUrl } from "@/lib/site";
import { RadarJobsListing, type RadarSearchParams } from "../jobs-listing";
import { RadarPageShell } from "../page-shell";
import { RadarViewTracker } from "../radar-view-tracker";

export function generateMetadata(): Metadata {
  const url = getAbsoluteUrl("/radar/senior");

  return {
    title: "Vagas sênior de tecnologia no Brasil | EarlyCV",
    description:
      "Vagas sênior de tecnologia com score de compatibilidade personalizado. Analise seu CV gratuitamente.",
    alternates: { canonical: url },
  };
}

type PageProps = {
  searchParams: Promise<RadarSearchParams>;
};

export default async function RadarSeniorPage({ searchParams }: PageProps) {
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
      <RadarViewTracker radarViewType="senior" seniority="SENIOR" />
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
