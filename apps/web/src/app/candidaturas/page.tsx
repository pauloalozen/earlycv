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
import { hasAvailableCredits } from "@/lib/plan-credits";
import { getMyPlan } from "@/lib/plans-api";
import { getMasterResumeFromList, listMyResumes } from "@/lib/resumes-api";
import { CandidaturasClient } from "./candidaturas-client";

export const metadata: Metadata = {
  robots: { follow: false, index: false },
  title: "Minhas Candidaturas | EarlyCV",
};

type Props = {
  searchParams?: Promise<{ view?: string }>;
};

export default async function CandidaturasPage({ searchParams }: Props) {
  const user = await getCurrentAppUserFromCookies();
  const redirectPath = getRouteAccessRedirectPath("/candidaturas", user);
  if (redirectPath) redirect(redirectPath);
  if (!user) redirect(getDefaultAppRedirectPath(null));

  const [
    applicationsResult,
    archivedApplicationsResult,
    planResult,
    resumesResult,
  ] = await Promise.allSettled([
    listJobApplications(1, 100, false),
    listJobApplications(1, 100, true),
    getMyPlan(),
    listMyResumes(),
  ]);

  const applications =
    applicationsResult.status === "fulfilled"
      ? applicationsResult.value.items
      : [];
  const applicationsLoadError =
    applicationsResult.status === "rejected"
      ? applicationsResult.reason instanceof Error
        ? applicationsResult.reason.message
        : "Nao foi possivel carregar suas candidaturas agora. Tente novamente."
      : null;
  const archivedApplications =
    archivedApplicationsResult.status === "fulfilled"
      ? archivedApplicationsResult.value.items
      : [];

  const planInfo = planResult.status === "fulfilled" ? planResult.value : null;
  const availableCredits = toHeaderAvailableCredits(planInfo);
  const hasCredits = hasAvailableCredits(planInfo);
  const hasMasterResume =
    resumesResult.status === "fulfilled"
      ? Boolean(await getMasterResumeFromList(resumesResult.value))
      : false;

  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const initialView =
    resolvedSearchParams?.view === "arquivadas" ? "arquivadas" : "ativas";

  return (
    <CandidaturasClient
      initialApplications={applications}
      initialArchivedApplications={archivedApplications}
      initialView={initialView}
      applicationsLoadError={applicationsLoadError}
      hasMasterResume={hasMasterResume}
      hasCredits={hasCredits}
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
