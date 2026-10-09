import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getRouteAccessRedirectPath } from "@/lib/app-session";
import { getCurrentAppUserFromCookies } from "@/lib/app-session.server";
import { fetchGuestAnalysisAuthGateEnabledServer } from "@/lib/guest-analysis-auth-gate.server";
import { defaultOpenGraph, getAbsoluteUrl } from "@/lib/site";
import { AdaptarPageClient } from "./adaptar-client";

export const metadata: Metadata = {
  alternates: { canonical: getAbsoluteUrl("/adaptar") },
  openGraph: { ...defaultOpenGraph, url: getAbsoluteUrl("/adaptar") },
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
