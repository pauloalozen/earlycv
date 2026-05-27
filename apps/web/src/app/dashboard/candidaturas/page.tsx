import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AppHeader } from "@/components/app-header";
import {
  getDefaultAppRedirectPath,
  getRouteAccessRedirectPath,
} from "@/lib/app-session";
import { getCurrentAppUserFromCookies } from "@/lib/app-session.server";
import { toHeaderAvailableCredits } from "@/lib/header-credits";
import { listJobApplications } from "@/lib/job-applications-api";
import { getMyPlan } from "@/lib/plans-api";
import { CandidaturasClient } from "./candidaturas-client";

export const metadata: Metadata = {
  robots: { follow: false, index: false },
  title: "Minhas Candidaturas | EarlyCV",
};

export default async function CandidaturasPage() {
  const user = await getCurrentAppUserFromCookies();
  const redirectPath = getRouteAccessRedirectPath(
    "/dashboard/candidaturas",
    user,
  );
  if (redirectPath) redirect(redirectPath);
  if (!user) redirect(getDefaultAppRedirectPath(null));

  const [applicationsResult, planResult] = await Promise.allSettled([
    listJobApplications(1, 100),
    getMyPlan(),
  ]);

  const applications =
    applicationsResult.status === "fulfilled"
      ? applicationsResult.value.items
      : [];

  const planInfo = planResult.status === "fulfilled" ? planResult.value : null;
  const availableCredits = toHeaderAvailableCredits(planInfo);

  return (
    <CandidaturasClient
      initialApplications={applications}
      header={
        <AppHeader
          userName={user.name}
          userRole={user.internalRole}
          availableCredits={availableCredits}
        />
      }
    />
  );
}
