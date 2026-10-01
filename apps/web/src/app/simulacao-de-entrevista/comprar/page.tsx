import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AppHeader } from "@/components/app-header";
import { PageShell } from "@/components/page-shell";
import { getCurrentAppUserFromCookies } from "@/lib/app-session.server";
import { toHeaderAvailableCredits } from "@/lib/header-credits";
import { getJobApplication } from "@/lib/job-applications-api";
import { formatMockInterviewPrice } from "@/lib/mock-interview-offer";
import { fetchMockInterviewOffer } from "@/lib/mock-interview-offer.server";
import { resolveCheckoutOrigin } from "@/lib/mock-interviews-types";
import { getMyPlan } from "@/lib/plans-api";
import { SANS } from "../_components/flow-styles";
import { CheckoutPanel } from "./checkout-panel";

export const metadata: Metadata = {
  robots: { follow: false, index: false },
  title: "Comprar entrevista simulada | EarlyCV",
};

type SearchParams = { origem?: string; candidatura?: string };

export default async function ComprarEntrevistaSimuladaPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const candidatura = sp.candidatura?.trim() || null;

  const user = await getCurrentAppUserFromCookies();
  if (!user) {
    const params = new URLSearchParams();
    if (sp.origem) params.set("origem", sp.origem);
    if (candidatura) params.set("candidatura", candidatura);
    const next = `/simulacao-de-entrevista/comprar${params.size ? `?${params}` : ""}`;
    redirect(`/entrar?tab=cadastro&next=${encodeURIComponent(next)}`);
  }

  const [planResult, applicationResult, offer] = await Promise.all([
    Promise.allSettled([getMyPlan()]).then(([result]) => result),
    Promise.allSettled([
      candidatura ? getJobApplication(candidatura) : Promise.resolve(null),
    ]).then(([result]) => result),
    fetchMockInterviewOffer(),
  ]);
  const application =
    applicationResult.status === "fulfilled" && applicationResult.value
      ? {
          jobTitle: applicationResult.value.jobTitle,
          companyName: applicationResult.value.companyName,
        }
      : null;

  return (
    <main
      style={{
        fontFamily: SANS,
        minHeight: "100dvh",
        background: "#ffffff",
        color: "#0a0a0a",
      }}
    >
      <AppHeader
        availableCredits={
          planResult.status === "fulfilled"
            ? toHeaderAvailableCredits(planResult.value)
            : "—"
        }
        userName={user.name}
        userRole={user.internalRole}
      />
      <PageShell>
        <div
          style={{
            maxWidth: 560,
            margin: "0 auto",
            padding: "24px 16px 80px",
          }}
        >
          <CheckoutPanel
            application={application}
            jobApplicationId={application ? candidatura : null}
            origin={resolveCheckoutOrigin(sp.origem, Boolean(application))}
            priceLabel={
              offer ? formatMockInterviewPrice(offer.amountInCents) : null
            }
          />
        </div>
      </PageShell>
    </main>
  );
}
