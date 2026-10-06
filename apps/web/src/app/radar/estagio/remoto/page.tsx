import type { Metadata } from "next";

import { internshipRemoteLanding } from "@/lib/radar-landings";
import {
  buildRadarLandingMetadata,
  RadarLandingPage,
} from "../../_landing/radar-landing-page";
import type { RadarSearchParams } from "../../jobs-listing";

// Landing perene: estágio remoto (ver lib/radar-landings.ts).
type PageProps = {
  searchParams: Promise<RadarSearchParams>;
};

export async function generateMetadata({
  searchParams,
}: PageProps): Promise<Metadata> {
  return buildRadarLandingMetadata(
    internshipRemoteLanding(),
    await searchParams,
  );
}

export default async function Page({ searchParams }: PageProps) {
  return (
    <RadarLandingPage
      landing={internshipRemoteLanding()}
      searchParams={await searchParams}
    />
  );
}
