"use client";

import { useEffect, useRef } from "react";
import { trackEvent } from "@/lib/analytics-tracking";
import type {
  MonitorAlertFrequency,
  MonitorRecommendationFeedback,
  MonitorRecommendationFeedbackReason,
  MonitorRecommendationItem,
} from "@/lib/monitor-api";
import { getMonitorProductOrigin } from "./monitor-attribution";
import { MonitorRecommendationCard } from "./monitor-recommendation-card";

const MONO = "var(--font-geist-mono), monospace";
const GEIST = "var(--font-geist), -apple-system, system-ui, sans-serif";

function MailIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#6a6560"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 4h16v16H4z" />
      <path d="M4 6l8 7 8-7" />
    </svg>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 14 14"
      fill="none"
      aria-hidden="true"
      style={{
        color: "#8a8a85",
        flexShrink: 0,
        transform: open ? "rotate(0deg)" : "rotate(-90deg)",
        transition: "transform 0.15s",
      }}
    >
      <path
        d="M3 5l4 4 4-4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function formatSentAt(iso: string): string {
  const date = new Date(iso);
  const datePart = date.toLocaleDateString("pt-BR", {
    day: "numeric",
    month: "short",
    timeZone: "America/Sao_Paulo",
  });
  const timePart = date.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
  return `${datePart}, ${timePart}`;
}

export type MonitorNotificationGroupProps = {
  variant: "pending" | "sent";
  // Só existem (e são obrigatórios) em variant "sent" — um grupo enviado
  // sempre veio de um MonitorDigest real.
  digestId?: string;
  sentAt?: string;
  frequency?: MonitorAlertFrequency;
  items: MonitorRecommendationItem[];
  open: boolean;
  onToggle: () => void;
  onViewed: (recommendationId: string) => void;
  onDismiss: (recommendationId: string) => void;
  onFeedback: (
    recommendationId: string,
    feedback: MonitorRecommendationFeedback,
    feedbackReason?: MonitorRecommendationFeedbackReason,
  ) => void;
};

// Sanfona igual à de /candidaturas (StatusAccordion): header clicável,
// chips de empresa como preview quando colapsado, corpo com transição via
// grid-template-rows. Puramente apresentacional pro que é exibido — quem
// possui o array `items` (e decide se dismiss remove o card ou só marca
// "Descartada") e o estado aberto/fechado é o MonitorView.
export function MonitorNotificationGroup({
  variant,
  digestId,
  sentAt,
  items,
  open,
  onToggle,
  onViewed,
  onDismiss,
  onFeedback,
}: MonitorNotificationGroupProps) {
  const headerRef = useRef<HTMLDivElement>(null);
  const viewedRef = useRef(false);

  // biome-ignore lint/correctness/useExhaustiveDependencies: dispara uma única vez por grupo montado — não deve reagir a mudanças em `items`/`open` (dismiss/feedback/colapsar não devem re-disparar o evento de visualização).
  useEffect(() => {
    if (variant !== "sent" || !digestId || !sentAt) return;
    const el = headerRef.current;
    if (!el || viewedRef.current || !("IntersectionObserver" in window)) {
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && !viewedRef.current) {
            viewedRef.current = true;
            void trackEvent({
              eventName: "monitor_digest_viewed",
              eventVersion: 1,
              properties: {
                digest_id: digestId,
                sent_at: sentAt,
                recommendation_count: items.length,
                product_origin: getMonitorProductOrigin(),
              },
            });
            io.disconnect();
          }
        }
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [variant, digestId, sentAt]);

  if (items.length === 0) return null;

  const previewCompanies = Array.from(
    new Set(items.map((item) => item.job.company)),
  ).slice(0, 3);

  return (
    <div
      style={{
        borderRadius: 13,
        overflow: "hidden",
        border: "1px solid rgba(10,10,10,0.07)",
        borderLeft: `3px solid ${variant === "pending" ? "#7aa811" : "#8a8a85"}`,
        background: "#fafaf6",
        marginBottom: 14,
      }}
    >
      {/* Header — div intencional: contém o grupo de cards no corpo, mas o próprio header não tem elementos interativos aninhados, só decorativos */}
      {/* biome-ignore lint/a11y/useSemanticElements: mantém o mesmo padrão de StatusAccordion (candidaturas) */}
      <div
        ref={headerRef}
        role="button"
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggle();
          }
        }}
        aria-expanded={open}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 9,
          padding: "13px 16px",
          cursor: "pointer",
          fontFamily: GEIST,
        }}
      >
        {variant === "sent" ? <MailIcon /> : null}
        <p style={{ margin: 0, fontSize: 13, fontWeight: 500, whiteSpace: "nowrap" }}>
          {variant === "sent" && sentAt
            ? `Enviado por e-mail em ${formatSentAt(sentAt)}`
            : "Novas vagas encontradas"}
        </p>

        {!open ? (
          <div
            style={{
              display: "flex",
              gap: 5,
              marginLeft: 2,
              flex: 1,
              overflow: "hidden",
              alignItems: "center",
            }}
          >
            {previewCompanies.map((company) => (
              <span
                key={company}
                style={{
                  fontFamily: MONO,
                  fontSize: 10.5,
                  color: "#6a6a66",
                  background: "rgba(10,10,10,0.04)",
                  border: "1px solid rgba(10,10,10,0.07)",
                  borderRadius: 999,
                  padding: "3px 9px",
                  whiteSpace: "nowrap",
                  maxWidth: 130,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {company}
              </span>
            ))}
          </div>
        ) : (
          <div style={{ flex: 1 }} />
        )}

        <span style={{ fontFamily: MONO, fontSize: 10.5, color: "#8a8a85" }}>
          {items.length} {items.length === 1 ? "vaga" : "vagas"}
        </span>
        <ChevronIcon open={open} />
      </div>

      {/* Corpo com animação suave — mesmo padrão de StatusAccordion */}
      <div
        style={{
          display: "grid",
          gridTemplateRows: open ? "1fr" : "0fr",
          transition: "grid-template-rows 0.3s ease",
        }}
      >
        <div style={{ overflow: "hidden" }}>
          {variant === "pending" ? (
            <p
              style={{
                margin: "0 16px 12px",
                fontSize: 12.5,
                color: "#6a6560",
              }}
            >
              Encontramos {items.length}{" "}
              {items.length === 1 ? "vaga" : "vagas"} desde o seu último
              alerta.
            </p>
          ) : null}
          <div
            className="monitor-level-grid"
            style={{ padding: "10px 16px 16px" }}
          >
            {items.map((item) => (
              <MonitorRecommendationCard
                key={item.recommendationId}
                item={item}
                digestId={variant === "sent" ? digestId : undefined}
                notificationStatus={variant}
                onViewed={onViewed}
                onDismiss={onDismiss}
                onFeedback={onFeedback}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
