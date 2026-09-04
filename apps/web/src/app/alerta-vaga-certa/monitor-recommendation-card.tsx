"use client";

import { useRef, useState } from "react";
import { CompanyLogo } from "@/app/radar/company-logo";
import { formatRelativeTime } from "@/app/radar/job-card";
import { OPPORTUNITY_LEVELS } from "@/app/radar/radar-ui";
import { trackEvent } from "@/lib/analytics-tracking";
import { getStatusConfig } from "@/lib/job-application-status";
import { writeJobNavigationContext } from "@/lib/journey-session";
import type {
  MonitorRecommendationFeedback,
  MonitorRecommendationFeedbackReason,
  MonitorRecommendationItem,
} from "@/lib/monitor-api";
import { getMonitorProductOrigin } from "./monitor-attribution";

const DISMISSED_BADGE = {
  label: "Descartada",
  bg: "#fff",
  color: "#8a8a85",
  border: "rgba(10,10,10,0.10)",
  dot: "#c8c6bf",
};

const SAVED_BADGE = {
  label: "Salva",
  bg: "#fff",
  color: "#3a3a36",
  border: "rgba(10,10,10,0.10)",
  dot: "#a8a6a0",
};

// Ordem de precedência: candidatura real > "descartada" > "salva". Alguém
// pode ter clicado "ignorar" aqui e depois se candidatado pelo Radar —
// nesse caso "Candidatou-se" é informação mais relevante que "Descartada".
function getRecommendationBadge(item: MonitorRecommendationItem) {
  if (item.job.existingApplication?.status) {
    return getStatusConfig(item.job.existingApplication.status);
  }
  if (item.dismissedAt) {
    return DISMISSED_BADGE;
  }
  if (item.job.isSaved) {
    return SAVED_BADGE;
  }
  return null;
}

const GEIST = "var(--font-geist), -apple-system, system-ui, sans-serif";
const MONO = "var(--font-geist-mono), monospace";

const WORK_MODEL_LABELS: Record<string, string> = {
  remote: "remoto",
  hybrid: "híbrido",
  "on-site": "presencial",
};

const FEEDBACK_REASONS: {
  value: MonitorRecommendationFeedbackReason;
  label: string;
}[] = [
  { value: "TITLE_MISMATCH", label: "Cargo inadequado" },
  { value: "AREA_MISMATCH", label: "Área errada" },
  { value: "SENIORITY_MISMATCH", label: "Senioridade errada" },
  { value: "LOCATION_MISMATCH", label: "Localização" },
  { value: "COMPANY_MISMATCH", label: "Empresa" },
  { value: "OTHER", label: "Outro motivo" },
];

function ThumbUpIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M7 11v9M2 13v5a2 2 0 0 0 2 2h12.9a2 2 0 0 0 2-1.6l1.4-7A2 2 0 0 0 18.3 9H14V4a2 2 0 0 0-2-2L7 11" />
    </svg>
  );
}

function ThumbDownIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ transform: "scaleY(-1) scaleX(-1)" }}
      aria-hidden="true"
    >
      <path d="M7 11v9M2 13v5a2 2 0 0 0 2 2h12.9a2 2 0 0 0 2-1.6l1.4-7A2 2 0 0 0 18.3 9H14V4a2 2 0 0 0-2-2L7 11" />
    </svg>
  );
}

function DismissIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  );
}

export type MonitorRecommendationCardProps = {
  item: MonitorRecommendationItem;
  // Só presentes quando o card vive num grupo "Alertas enviados" — usados
  // só pra enriquecer o analytics de clique (ver handleTitleClick).
  digestId?: string;
  notificationStatus?: "sent" | "pending";
  onViewed: (recommendationId: string) => void;
  onDismiss: (recommendationId: string) => void;
  onFeedback: (
    recommendationId: string,
    feedback: MonitorRecommendationFeedback,
    feedbackReason?: MonitorRecommendationFeedbackReason,
  ) => void;
};

// Card compacto do Meu Monitor — deliberadamente diferente do JobCard do
// Radar (que é full-width, com logo grande, badges de tecnologia e
// breakdown). Aqui o card é pensado pra grid de 3-4 por linha, com menos
// informação, e as ações "achou isso pra você / ignorar" vivem DENTRO do
// próprio card (não penduradas embaixo como na versão anterior). Sem CTA
// de adaptar/ver candidatura — o clique no título já leva pro detalhe da
// vaga, de onde esses fluxos continuam acessíveis.
export function MonitorRecommendationCard({
  item,
  digestId,
  notificationStatus,
  onViewed,
  onDismiss,
  onFeedback,
}: MonitorRecommendationCardProps) {
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackGiven, setFeedbackGiven] = useState(item.feedback);
  const engagedRef = useRef(false);

  const level =
    OPPORTUNITY_LEVELS[item.opportunityLevel] ?? OPPORTUNITY_LEVELS[0];
  const workModelLabel = item.job.workModel
    ? (WORK_MODEL_LABELS[item.job.workModel] ?? item.job.workModel)
    : null;
  const published = item.job.publishedAtSource ?? item.job.firstSeenAt;
  const badge = getRecommendationBadge(item);
  const isDismissed = Boolean(item.dismissedAt);

  function handleTitleClick() {
    if (!engagedRef.current) {
      engagedRef.current = true;
      onViewed(item.recommendationId);
    }
    const productOrigin = getMonitorProductOrigin();
    // Sem isso, job_detail_viewed (na página de destino) nunca sabe que a
    // navegação começou aqui — cai no fallback de previousRoute, que só
    // reconhece "/radar". Mesmo mecanismo que RadarOpportunityLink já usa.
    writeJobNavigationContext(item.job.id, productOrigin);
    void trackEvent({
      eventName: "monitor_recommendation_clicked",
      eventVersion: 1,
      properties: {
        jobId: item.job.id,
        score: item.score,
        opportunityLevel: item.opportunityLevel,
        digestId: digestId ?? null,
        notificationStatus: notificationStatus ?? null,
        product_origin: productOrigin,
      },
    });
  }

  function handleFeedback(
    feedback: MonitorRecommendationFeedback,
    feedbackReason?: MonitorRecommendationFeedbackReason,
  ) {
    setFeedbackGiven(feedback);
    setFeedbackOpen(false);
    onFeedback(item.recommendationId, feedback, feedbackReason);
  }

  return (
    <div
      style={{
        position: "relative",
        background: "#fafaf6",
        border: `1px solid ${item.opportunityLevel >= 4 ? "rgba(31,143,61,0.28)" : "rgba(10,10,10,0.08)"}`,
        borderRadius: 14,
        padding: 16,
        display: "flex",
        flexDirection: "column",
        gap: 9,
        fontFamily: GEIST,
      }}
    >
      {item.isNew ? (
        <span
          style={{
            position: "absolute",
            top: -8,
            left: 14,
            background: "#0a0a0a",
            color: "#c6ff3a",
            fontFamily: MONO,
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: 0.5,
            textTransform: "uppercase",
            padding: "3px 8px",
            borderRadius: 99,
          }}
        >
          Nova
        </span>
      ) : null}

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 9,
          marginTop: item.isNew ? 4 : 0,
        }}
      >
        <CompanyLogo
          name={item.job.company}
          logoUrl={item.job.companyLogoUrl}
          websiteUrl={item.job.companyWebsiteUrl}
          size={30}
          borderRadius={8}
          fontSize={12}
        />
        <span
          style={{
            fontSize: 12,
            color: "#6a6560",
            minWidth: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {item.job.company}
        </span>
      </div>

      <a
        href={`/radar/${item.job.slug}`}
        onClick={handleTitleClick}
        style={{
          fontSize: 14.5,
          fontWeight: 500,
          lineHeight: 1.32,
          letterSpacing: -0.01,
          color: "#0a0a0a",
          textDecoration: "none",
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
          minHeight: 38,
        }}
      >
        {item.job.title}
      </a>

      {badge ? (
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            alignSelf: "flex-start",
            fontFamily: MONO,
            fontSize: 9.5,
            fontWeight: 600,
            letterSpacing: 0.3,
            textTransform: "uppercase",
            padding: "3px 7px",
            borderRadius: 999,
            background: badge.bg,
            color: badge.color,
            border: `1px solid ${badge.border}`,
          }}
        >
          <span
            aria-hidden
            style={{
              width: 5,
              height: 5,
              borderRadius: "50%",
              background: badge.dot,
              flexShrink: 0,
            }}
          />
          {badge.label}
        </span>
      ) : null}

      <p
        style={{
          margin: 0,
          fontSize: 11.5,
          color: "#8a8a85",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {item.job.location}
        {workModelLabel ? ` · ${workModelLabel}` : ""}
      </p>

      <p
        style={{
          margin: 0,
          fontFamily: MONO,
          fontSize: 10,
          color: "#a8a6a0",
        }}
      >
        publicada {formatRelativeTime(published)}
      </p>

      <div
        style={{
          height: 1,
          background: "rgba(10,10,10,0.07)",
          margin: "2px 0 0",
        }}
      />

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <span
          style={{
            fontFamily: MONO,
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: 0.4,
            textTransform: "uppercase",
            color: level.fg,
          }}
        >
          {level.label}
        </span>

        <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
          <button
            type="button"
            aria-label="Achou isso pra você"
            aria-pressed={feedbackGiven === "POSITIVE"}
            onClick={() => handleFeedback("POSITIVE")}
            style={{
              border: "none",
              background:
                feedbackGiven === "POSITIVE"
                  ? "rgba(34,163,72,0.16)"
                  : "transparent",
              padding: 5,
              borderRadius: 6,
              cursor: "pointer",
              color: feedbackGiven === "POSITIVE" ? "#1f7a34" : "#8a8a85",
              display: "flex",
            }}
          >
            <ThumbUpIcon />
          </button>
          <div style={{ position: "relative" }}>
            <button
              type="button"
              aria-label="Não é pra mim"
              aria-pressed={feedbackGiven === "NEGATIVE"}
              onClick={() => setFeedbackOpen((open) => !open)}
              style={{
                border: "none",
                background:
                  feedbackGiven === "NEGATIVE"
                    ? "rgba(239,68,68,0.14)"
                    : "transparent",
                padding: 5,
                borderRadius: 6,
                cursor: "pointer",
                color: feedbackGiven === "NEGATIVE" ? "#b91c1c" : "#8a8a85",
                display: "flex",
              }}
            >
              <ThumbDownIcon />
            </button>
            {feedbackOpen ? (
              <div
                style={{
                  position: "absolute",
                  bottom: "calc(100% + 6px)",
                  right: 0,
                  zIndex: 10,
                  background: "#fff",
                  border: "1px solid rgba(10,10,10,0.1)",
                  borderRadius: 10,
                  padding: 6,
                  minWidth: 180,
                  boxShadow: "0 8px 28px rgba(0,0,0,0.12)",
                }}
              >
                <p
                  style={{
                    margin: "4px 6px 6px",
                    fontSize: 11,
                    color: "#8a8a85",
                  }}
                >
                  Por quê?
                </p>
                {FEEDBACK_REASONS.map((reason) => (
                  <button
                    key={reason.value}
                    type="button"
                    onClick={() => handleFeedback("NEGATIVE", reason.value)}
                    style={{
                      display: "block",
                      width: "100%",
                      textAlign: "left",
                      padding: "7px 8px",
                      borderRadius: 7,
                      border: "none",
                      background: "transparent",
                      fontSize: 12,
                      color: "#3a3a38",
                      cursor: "pointer",
                    }}
                  >
                    {reason.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <button
            type="button"
            aria-label="Ignorar"
            disabled={isDismissed}
            onClick={() => onDismiss(item.recommendationId)}
            style={{
              border: "none",
              background: "transparent",
              padding: 5,
              borderRadius: 6,
              cursor: isDismissed ? "default" : "pointer",
              color: isDismissed ? "#c8c6bf" : "#8a8a85",
              display: "flex",
            }}
          >
            <DismissIcon />
          </button>
        </div>
      </div>
    </div>
  );
}
