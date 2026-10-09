import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getRouteAccessRedirectPath } from "@/lib/app-session";
import { getCurrentAppUserFromCookies } from "@/lib/app-session.server";
import { fetchGuestAnalysisAuthGateEnabledServer } from "@/lib/guest-analysis-auth-gate.server";
import { defaultOpenGraph, getAbsoluteUrl } from "@/lib/site";
import { AdaptarPageClient } from "./adaptar-client";

const TITLE = "Adaptar currículo para a vaga, grátis | EarlyCV";
const DESCRIPTION =
  "Cole a vaga e seu currículo e veja em segundos o que falta para passar no filtro ATS. Análise grátis, sem inventar experiência.";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  alternates: { canonical: getAbsoluteUrl("/adaptar") },
  openGraph: {
    ...defaultOpenGraph,
    title: TITLE,
    description: DESCRIPTION,
    url: getAbsoluteUrl("/adaptar"),
  },
  // twitter substitui o objeto do layout raiz inteiro: repete o card.
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
};

export default async function AdaptarPage() {
  const gateEnabled = await fetchGuestAnalysisAuthGateEnabledServer();

  if (gateEnabled) {
    const user = await getCurrentAppUserFromCookies();
    if (!user) {
      redirect("/entrar?next=/adaptar");
      return null;
    }
    const redirectPath = getRouteAccessRedirectPath("/adaptar", user);
    if (redirectPath) {
      redirect(redirectPath);
      return null;
    }
  }

  return <AdaptarPageClient />;
}
