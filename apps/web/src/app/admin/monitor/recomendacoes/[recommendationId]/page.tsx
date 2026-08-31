import Link from "next/link";
import { notFound } from "next/navigation";

import {
  AdminPageWrap,
  AdminPill,
  AT,
} from "@/app/admin/_components/admin-primitives";
import { AdminShellHeader } from "@/app/admin/_components/admin-shell-header";
import { AdminTokenState } from "@/app/admin/_components/admin-token-state";
import { getAdminMonitorRecommendationDetail } from "@/lib/admin-monitor-api";
import { buildAdminStateModel } from "@/lib/admin-state";
import { getBackofficeSessionToken } from "@/lib/backoffice-session.server";
import { buildAdminMetadata } from "@/lib/route-metadata";

export const metadata = buildAdminMetadata("Recomendação — Meu Monitor");

type PageProps = { params: Promise<{ recommendationId: string }> };

function fmt(value: string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleString("pt-BR");
}

const SKIP_REASON_LABEL: Record<string, string> = {
  user_has_no_radar_profile: "Usuário não tem UserRadarProfile hoje.",
  job_has_no_enrichment: "Vaga não tem JobEnrichment hoje.",
};

export default async function AdminMonitorRecommendationPage({
  params,
}: PageProps) {
  const { recommendationId } = await params;
  const token = await getBackofficeSessionToken();

  if (!token) {
    const state = buildAdminStateModel(
      "missing-token",
      `/admin/monitor/recomendacoes/${recommendationId}`,
    );
    return (
      <div className="px-6 py-10 md:px-10">
        <AdminTokenState {...state} />
      </div>
    );
  }

  let detail: Awaited<ReturnType<typeof getAdminMonitorRecommendationDetail>>;
  try {
    detail = await getAdminMonitorRecommendationDetail(recommendationId, token);
  } catch (err) {
    if (err instanceof Error && err.message.includes("API 404")) {
      notFound();
    }
    const state = buildAdminStateModel(
      "unexpected-error",
      `/admin/monitor/recomendacoes/${recommendationId}`,
    );
    return (
      <div className="px-6 py-10 md:px-10">
        <AdminTokenState {...state} />
      </div>
    );
  }

  const {
    recommendation,
    scoreAtRecommendationTime,
    currentRecalculatedScore,
    recalculationSkippedReason,
  } = detail;

  return (
    <AdminPageWrap>
      <AdminShellHeader
        eyebrow="Meu Monitor · Explicação do matching"
        title={recommendation.job.title}
        subtitle={`${recommendation.job.company} · para ${recommendation.user.name} (${recommendation.user.email})`}
      />

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <Link
          href={`/admin/monitor/usuarios/${recommendation.userId}`}
          style={{ fontSize: 12, textDecoration: "underline" }}
        >
          Ver usuário
        </Link>
        <span style={{ color: AT.muted }}>·</span>
        <Link
          href={`/admin/monitor/vagas/${recommendation.jobId}`}
          style={{ fontSize: 12, textDecoration: "underline" }}
        >
          Ver vaga
        </Link>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 16,
          marginBottom: 24,
        }}
      >
        <div
          style={{
            background: AT.card,
            border: `1px solid ${AT.border}`,
            borderRadius: 10,
            padding: "16px 18px",
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: AT.ink2,
              marginBottom: 4,
            }}
          >
            SCORE NO MOMENTO DA RECOMENDAÇÃO
          </div>
          <p style={{ fontSize: 11, color: AT.muted, marginBottom: 10 }}>
            Valor persistido em UserJobRecommendation — histórico, nunca
            recalculado.
          </p>
          <div style={{ fontSize: 30, fontWeight: 500 }}>
            {scoreAtRecommendationTime.score}
          </div>
          <div style={{ marginTop: 6 }}>
            <AdminPill
              tone={
                scoreAtRecommendationTime.opportunityLevel >= 3
                  ? "ok"
                  : "neutral"
              }
            >
              nível {scoreAtRecommendationTime.opportunityLevel}
            </AdminPill>
          </div>
          <p style={{ fontSize: 11, color: AT.muted, marginTop: 10 }}>
            recomendada em {fmt(scoreAtRecommendationTime.recommendedAt)}
          </p>
          <p style={{ fontSize: 10.5, color: AT.faint, marginTop: 6 }}>
            Breakdown por dimensão NUNCA foi persistido — não é possível
            reconstruir o breakdown histórico exato.
          </p>
        </div>

        <div
          style={{
            background: AT.card,
            border: `1px solid ${AT.border}`,
            borderRadius: 10,
            padding: "16px 18px",
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: AT.ink2,
              marginBottom: 4,
            }}
          >
            SCORE ATUAL RECALCULADO
          </div>
          <p style={{ fontSize: 11, color: AT.muted, marginBottom: 10 }}>
            Calculado agora via MatchingEngine.calculateScore, sobre o
            perfil/vaga ATUAIS — pode divergir do histórico, e isso é esperado.
          </p>
          {currentRecalculatedScore ? (
            <>
              <div style={{ fontSize: 30, fontWeight: 500 }}>
                {currentRecalculatedScore.score}
              </div>
              <div style={{ marginTop: 6 }}>
                <AdminPill
                  tone={
                    currentRecalculatedScore.opportunityLevel >= 3
                      ? "ok"
                      : "neutral"
                  }
                >
                  nível {currentRecalculatedScore.opportunityLevel}
                </AdminPill>
              </div>
              <div
                style={{
                  marginTop: 10,
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 6,
                }}
              >
                {Object.entries(currentRecalculatedScore.breakdown).map(
                  ([dim, value]) => (
                    <AdminPill key={dim} mono>
                      {dim}: {value}
                    </AdminPill>
                  ),
                )}
              </div>
            </>
          ) : (
            <p style={{ fontSize: 12, color: AT.muted }}>
              Não recalculado —{" "}
              {SKIP_REASON_LABEL[recalculationSkippedReason ?? ""] ??
                recalculationSkippedReason}
            </p>
          )}
        </div>
      </div>

      {currentRecalculatedScore && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 16,
            marginBottom: 24,
          }}
        >
          <SkillList
            title="Skills compatíveis"
            items={currentRecalculatedScore.matchedSkills}
            tone="ok"
          />
          <SkillList
            title="Skills ausentes"
            items={currentRecalculatedScore.missingSkills}
            tone="danger"
          />
        </div>
      )}

      <div
        style={{
          background: AT.card,
          border: `1px solid ${AT.border}`,
          borderRadius: 10,
          padding: "16px 18px",
        }}
      >
        <div
          style={{
            fontSize: 12,
            fontWeight: 500,
            marginBottom: 10,
            color: AT.ink2,
          }}
        >
          Estado da recomendação
        </div>
        <Row label="viewedAt">{fmt(recommendation.viewedAt)}</Row>
        <Row label="dismissedAt">{fmt(recommendation.dismissedAt)}</Row>
        <Row label="supersededAt">{fmt(recommendation.supersededAt)}</Row>
        <Row label="feedback">{recommendation.feedback ?? "—"}</Row>
        <Row label="feedbackReason">{recommendation.feedbackReason ?? "—"}</Row>
      </div>
    </AdminPageWrap>
  );
}

function SkillList({
  title,
  items,
  tone,
}: {
  title: string;
  items: string[];
  tone: "ok" | "danger";
}) {
  return (
    <div
      style={{
        background: AT.card,
        border: `1px solid ${AT.border}`,
        borderRadius: 10,
        padding: "16px 18px",
      }}
    >
      <div
        style={{
          fontSize: 12,
          fontWeight: 500,
          marginBottom: 10,
          color: AT.ink2,
        }}
      >
        {title}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {items.length === 0 && (
          <span style={{ color: AT.muted, fontSize: 12 }}>—</span>
        )}
        {items.map((item) => (
          <AdminPill key={item} tone={tone}>
            {item}
          </AdminPill>
        ))}
      </div>
    </div>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: 12,
        padding: "4px 0",
        fontSize: 12.5,
        borderBottom: `1px solid ${AT.borderSoft}`,
      }}
    >
      <span style={{ color: AT.muted }}>{label}</span>
      <span style={{ color: AT.ink2, textAlign: "right" }}>{children}</span>
    </div>
  );
}
