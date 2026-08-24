import type { Metadata } from "next";

import { getCurrentAppUserFromCookies } from "@/lib/app-session.server";
import { toHeaderAvailableCredits } from "@/lib/header-credits";
import { getMyPlan } from "@/lib/plans-api";
import { getAbsoluteUrl } from "@/lib/site";
import { RadarJobsListing, type RadarSearchParams } from "./jobs-listing";
import { RadarPageShell } from "./page-shell";
import { RadarViewTracker } from "./radar-view-tracker";

export function generateMetadata(): Metadata {
  const url = getAbsoluteUrl("/radar");
  return {
    title: "Vagas em Tech | Radar de Oportunidades — EarlyCV",
    description:
      "Encontre vagas de tecnologia, dados e produto com score de compatibilidade personalizado. Adapte seu CV em segundos.",
    alternates: { canonical: url },
    openGraph: {
      title: "Radar de Oportunidades — Vagas Tech | EarlyCV",
      description:
        "Vagas de tech com score de compatibilidade para o seu perfil.",
      url,
      type: "website",
    },
    twitter: {
      title: "Radar de Oportunidades — Vagas Tech | EarlyCV",
      description:
        "Vagas de tech com score de compatibilidade para o seu perfil.",
    },
  };
}

type VagasPageProps = {
  searchParams: Promise<RadarSearchParams>;
};

export default async function VagasPage({ searchParams }: VagasPageProps) {
  const user = await getCurrentAppUserFromCookies().catch(() => null);

  const availableCredits = user
    ? toHeaderAvailableCredits(await getMyPlan().catch(() => null))
    : undefined;

  const params = await searchParams;

  const websiteJsonLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "EarlyCV",
    url: getAbsoluteUrl("/"),
    potentialAction: {
      "@type": "SearchAction",
      target: `${getAbsoluteUrl("/radar")}?q={search_term_string}`,
      "query-input": "required name=search_term_string",
    },
  };

  return (
    <RadarPageShell
      userName={user?.name}
      userRole={user?.internalRole}
      credits={availableCredits}
      extraHead={
        <script type="application/ld+json">
          {JSON.stringify(websiteJsonLd)}
        </script>
      }
    >
      <RadarViewTracker radarViewType="all" />
      <RadarJobsListing basePath="/radar" user={user} searchParams={params} />
    </RadarPageShell>
  );
}
