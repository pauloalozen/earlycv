import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { AppHeader } from "@/components/app-header";
import {
  getDefaultAppRedirectPath,
  getRouteAccessRedirectPath,
} from "@/lib/app-session";
import { getCurrentAppUserFromCookies } from "@/lib/app-session.server";
import {
  getCvAdaptation,
  getCvAdaptationContent,
} from "@/lib/cv-adaptation-api";
import { extractDashboardAnalysisSignal } from "@/lib/dashboard-test-metrics";
import { toHeaderAvailableCredits } from "@/lib/header-credits";
import { getJobApplication } from "@/lib/job-applications-api";
import { getMyPlan } from "@/lib/plans-api";
import { listMyResumes } from "@/lib/resumes-api";
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

  const [applicationResult, planResult, resumesResult] =
    await Promise.allSettled([
      getJobApplication(id),
      getMyPlan(),
      listMyResumes(),
    ]);

  if (applicationResult.status === "rejected") {
    notFound();
  }

  const application = applicationResult.value;
  const planInfo = planResult.status === "fulfilled" ? planResult.value : null;
  const availableCredits = toHeaderAvailableCredits(planInfo);

  // Compute per-adaptation scores exactly like dashboard_old does
  const resumeList =
    resumesResult.status === "fulfilled" ? resumesResult.value : [];

  const contentResponses = await Promise.allSettled(
    application.cvAdaptations.map(async (a) => {
      const [content, dto] = await Promise.all([
        getCvAdaptationContent(a.id),
        getCvAdaptation(a.id).catch(() => null),
      ]);
      const signal = extractDashboardAnalysisSignal(content.adaptedContentJson);
      // adaptation_notes é o campo preferido; fallback: ajustes_conteudo titles
      const json = content.adaptedContentJson as Record<string, unknown>;
      const ajustesConteudo = Array.isArray(json.ajustes_conteudo)
        ? (
            json.ajustes_conteudo as Array<{
              titulo?: unknown;
              descricao?: unknown;
            }>
          )
            .filter(
              (item) => typeof item.titulo === "string" && item.titulo.trim(),
            )
            .map(
              (item) =>
                `${item.titulo}${typeof item.descricao === "string" && item.descricao.trim() ? `: ${item.descricao}` : ""}`,
            )
            .join("\n")
        : null;
      const notes = signal.adjustments.notes ?? (ajustesConteudo || null);
      const masterResumeId = dto?.masterResumeId ?? null;
      const resumeUsed = masterResumeId
        ? (resumeList.find((r) => r.id === masterResumeId) ?? null)
        : null;
      const resumeUsedTitle = resumeUsed
        ? resumeUsed.isMaster
          ? "CV Master"
          : resumeUsed.title
        : null;
      return {
        id: a.id,
        scoreBefore: signal.adjustments.scoreBefore,
        scoreAfter: signal.score,
        notes,
        resumeUsedTitle,
      };
    }),
  );

  const scoresById = new Map<
    string,
    {
      scoreBefore: number | null;
      scoreAfter: number | null;
      notes: string | null;
      resumeUsedTitle: string | null;
    }
  >();
  for (const r of contentResponses) {
    if (r.status === "fulfilled") {
      scoresById.set(r.value.id, {
        scoreBefore: r.value.scoreBefore,
        scoreAfter: r.value.scoreAfter,
        notes: r.value.notes,
        resumeUsedTitle: r.value.resumeUsedTitle,
      });
    }
  }

  const applicationWithScores = {
    ...application,
    cvAdaptations: application.cvAdaptations.map((a) => ({
      ...a,
      scoreBefore: scoresById.get(a.id)?.scoreBefore ?? null,
      scoreAfter: scoresById.get(a.id)?.scoreAfter ?? null,
      notes: scoresById.get(a.id)?.notes ?? null,
      resumeUsedTitle: scoresById.get(a.id)?.resumeUsedTitle ?? null,
    })),
  };

  return (
    <DetailClient
      application={applicationWithScores}
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
