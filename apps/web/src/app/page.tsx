import type { Metadata } from "next";
import { getAbsoluteUrl, siteConfig } from "@/lib/site";
import { resolveLandingVariant } from "./_landing/variant";
import { LandingVariantA } from "./_landing/variant-a";
import { LandingVariantB } from "./_landing/variant-b";
import { LandingVariantC } from "./_landing/variant-c";

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

export default function Home() {
  const variant = resolveLandingVariant(
    process.env.NEXT_PUBLIC_LANDING_VARIANT,
  );

  if (variant === "B") {
    return <LandingVariantB />;
  }

  if (variant === "C") {
    return <LandingVariantC />;
  }

  return <LandingVariantA />;
}
