import { redirect } from "next/navigation";
import { getRouteAccessRedirectPath } from "@/lib/app-session";
import { getCurrentAppUserFromCookies } from "@/lib/app-session.server";
import { fetchGuestAnalysisAuthGateEnabledServer } from "@/lib/guest-analysis-auth-gate.server";
import { AdaptarPageClient } from "./adaptar-client";

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
