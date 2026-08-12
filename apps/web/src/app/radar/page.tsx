import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getCurrentAppUserFromCookies } from "@/lib/app-session.server";
import {
  canAccessJobsInGhostMode,
  isJobsGhostModeEnabled,
} from "@/lib/jobs-ghost-mode";
import { getAbsoluteUrl } from "@/lib/site";
import { RadarJobsListing, type RadarSearchParams } from "./jobs-listing";
import { RadarPageShell } from "./page-shell";

export function generateMetadata(): Metadata {
  // export const metadata estático (como no rascunho original da spec)
  // perderia essa condicional — Google indexaria /radar mesmo com ghost mode
  // ligado, contradizendo o robots.txt. generateMetadata() preserva o
  // comportamento existente, só troca os textos.
  const isGhostMode = isJobsGhostModeEnabled();
  const url = getAbsoluteUrl("/radar");
  return {
    title: "Vagas em Tech | Radar de Oportunidades — EarlyCV",
    description:
      "Encontre vagas de tecnologia, dados e produto com score de compatibilidade personalizado. Adapte seu CV em segundos.",
    alternates: { canonical: url },
    robots: { index: !isGhostMode, follow: !isGhostMode },
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
  const isGhostMode = isJobsGhostModeEnabled();
  const user = await getCurrentAppUserFromCookies().catch(() => null);

  if (isGhostMode && !canAccessJobsInGhostMode(user?.internalRole)) {
    notFound();
  }

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
      extraHead={
        <script type="application/ld+json">
          {JSON.stringify(websiteJsonLd)}
        </script>
      }
    >
      <RadarJobsListing basePath="/radar" user={user} searchParams={params} />
    </RadarPageShell>
  );
}
