import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { AppHeader } from "@/components/app-header";
import {
  getDefaultAppRedirectPath,
  getRouteAccessRedirectPath,
} from "@/lib/app-session";
import { getCurrentAppUserFromCookies } from "@/lib/app-session.server";
import { toHeaderAvailableCredits } from "@/lib/header-credits";
import { getJobApplication } from "@/lib/job-applications-api";
import { getMyPlan } from "@/lib/plans-api";
import { DetailClient } from "./detail-client";

export const metadata: Metadata = {
  robots: { follow: false, index: false },
  title: "Candidatura | EarlyCV",
};

type Props = {
  params: Promise<{ id: string }>;
};

export default async function CandidaturaDetailPage({ params }: Props) {
  const user = await getCurrentAppUserFromCookies();
  const redirectPath = getRouteAccessRedirectPath("/candidaturas", user);
  if (redirectPath) redirect(redirectPath);
  if (!user) redirect(getDefaultAppRedirectPath(null));

  const { id } = await params;

  const [applicationResult, planResult] = await Promise.allSettled([
    getJobApplication(id),
    getMyPlan(),
  ]);

  if (applicationResult.status === "rejected") {
    notFound();
  }

  const application = applicationResult.value;
  const planInfo = planResult.status === "fulfilled" ? planResult.value : null;
  const availableCredits = toHeaderAvailableCredits(planInfo);

  return (
    <DetailClient
      application={application}
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
