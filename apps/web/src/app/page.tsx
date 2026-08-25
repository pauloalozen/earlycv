import type { Metadata } from "next";
import { getCurrentAppUserFromCookies } from "@/lib/app-session.server";
import { fetchGuestAnalysisAuthGateEnabledServer } from "@/lib/guest-analysis-auth-gate.server";
import { getAbsoluteUrl, siteConfig } from "@/lib/site";
import { resolveLandingVariant } from "./_landing/variant";
import { LandingVariantA } from "./_landing/variant-a";
import { LandingVariantB } from "./_landing/variant-b";
import { LandingVariantC } from "./_landing/variant-c";
import { LandingVariantD } from "./_landing/variant-d";
import { LandingVariantE } from "./_landing/variant-e";
import { LandingVariantF } from "./_landing/variant-f";

export const metadata: Metadata = {
  title: "Seu CV ajustado para cada vaga",
  description:
    "Descubra o que está te eliminando nas vagas e receba um CV ajustado para aumentar suas chances de entrevista.",
  alternates: {
    canonical: getAbsoluteUrl("/"),
  },
  keywords: [
    ...siteConfig.keywords,
    "adaptar curriculo para vaga",
    "cv ajustado",
    "curriculo ats",
    "análise de currículo",
  ],
  openGraph: {
    url: getAbsoluteUrl("/"),
    title: "EarlyCV - Seu CV ajustado para cada vaga",
    description:
      "Descubra o que está te eliminando nas vagas e receba um CV ajustado para aumentar suas chances de entrevista.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "EarlyCV - Seu CV ajustado para cada vaga",
    description:
      "Descubra o que está te eliminando nas vagas e receba um CV ajustado para aumentar suas chances de entrevista.",
  },
};

export default async function Home() {
  const variant = resolveLandingVariant(
    process.env.NEXT_PUBLIC_LANDING_VARIANT,
  );

  if (variant === "B") {
    return <LandingVariantB />;
  }

  if (variant === "C") {
    return <LandingVariantC />;
  }

  if (variant === "D") {
    return <LandingVariantD />;
  }

  if (variant === "E") {
    return <LandingVariantE />;
  }

  if (variant === "F") {
    const [guestAnalysisAuthGateEnabled, user] = await Promise.all([
      fetchGuestAnalysisAuthGateEnabledServer(),
      getCurrentAppUserFromCookies(),
    ]);
    return (
      <LandingVariantF
        guestAnalysisAuthGateEnabled={guestAnalysisAuthGateEnabled}
        isAuthenticated={!!user}
      />
    );
  }

  return <LandingVariantA />;
}
