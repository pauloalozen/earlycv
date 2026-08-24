import type { Metadata } from "next";

import { getCurrentAppUserFromCookies } from "@/lib/app-session.server";
import { toHeaderAvailableCredits } from "@/lib/header-credits";
import { getMyPlan } from "@/lib/plans-api";
import { getAbsoluteUrl } from "@/lib/site";
import { RadarJobsListing, type RadarSearchParams } from "../jobs-listing";
import { RadarPageShell } from "../page-shell";
import { RadarViewTracker } from "../radar-view-tracker";

export function generateMetadata(): Metadata {
  const url = getAbsoluteUrl("/radar/junior");

  return {
    title: "Vagas júnior de tecnologia no Brasil | EarlyCV",
    description:
      "Vagas júnior de tecnologia com score de compatibilidade personalizado. Analise seu CV gratuitamente.",
    alternates: { canonical: url },
  };
}

type PageProps = {
  searchParams: Promise<RadarSearchParams>;
};

export default async function RadarJuniorPage({ searchParams }: PageProps) {
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
      <RadarViewTracker radarViewType="junior" seniority="JUNIOR" />
      <RadarJobsListing
        basePath="/radar/junior"
        user={user}
        searchParams={resolvedSearchParams}
        fixedFilters={{ seniority: "JUNIOR" }}
        landingHeader={{
          eyebrow: "PORTAL DE VAGAS",
          title: "Vagas júnior de tecnologia",
          description:
            "Encontre as melhores vagas de nível júnior e analise seu CV gratuitamente.",
        }}
      />
    </RadarPageShell>
  );
}
