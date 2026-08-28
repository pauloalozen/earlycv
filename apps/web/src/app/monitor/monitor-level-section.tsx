"use client";

import { useEffect, useRef, useState } from "react";
import { OPPORTUNITY_LEVELS } from "@/app/radar/radar-ui";
import {
  dismissRecommendation,
  listMonitorRecommendations,
  type MonitorRecommendationFeedback,
  type MonitorRecommendationFeedbackReason,
  type MonitorRecommendationItem,
  type MonitorSort,
  markRecommendationViewed,
  submitRecommendationFeedback,
} from "@/lib/monitor-api";
import { MonitorRecommendationCard } from "./monitor-recommendation-card";

const MONO = "var(--font-geist-mono), monospace";

function ChevronLeft() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}

function ChevronRight() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M9 18l6-6-6-6" />
    </svg>
  );
}

// Estilos do grid compartilhados por todas as seções — renderizar uma vez
// (em MonitorView) evita duplicar o <style> por seção, mesmo padrão do
// JobCardResponsiveStyles.
export function MonitorGridStyles() {
  return (
    <style>{`
      .monitor-level-grid { display: grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap: 16px; }
      @media (max-width: 1100px) { .monitor-level-grid { grid-template-columns: repeat(3, minmax(0,1fr)); } }
      @media (max-width: 680px) { .monitor-level-grid { grid-template-columns: repeat(2, minmax(0,1fr)); gap: 12px; } }
    `}</style>
  );
}

export type MonitorLevelSectionProps = {
  level: number;
  initialItems: MonitorRecommendationItem[];
  initialTotal: number;
  pageSize: number;
  sort: MonitorSort;
};

// Cada seção pagina os itens do SEU nível de forma independente (até ~20
// por nível) — não existe uma paginação global da rota. Dismiss/feedback/
// viewed são resolvidos aqui mesmo, sem subir estado pro MonitorView,
// porque uma recomendação pertence a exatamente um nível.
export function MonitorLevelSection({
  level,
  initialItems,
  initialTotal,
  pageSize,
  sort,
}: MonitorLevelSectionProps) {
  const [items, setItems] = useState(initialItems);
  const [total, setTotal] = useState(initialTotal);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const isFirstRender = useRef(true);
  const lastRequestedPage = useRef(1);

  // Troca de ordenação (toggle "Maior aderência" / "Mais recentes" no
  // topo da rota) reseta a seção pra página 1 com a nova ordem.
  // biome-ignore lint/correctness/useExhaustiveDependencies: "total" é lido só como guarda contra falha silenciosa — incluir nas deps re-rodaria esse efeito a cada setTotal (loop), quando ele só deve reagir a sort/level/pageSize.
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    let cancelled = false;
    setLoading(true);
    listMonitorRecommendations(1, pageSize, false, level, sort).then((feed) => {
      if (cancelled) return;
      // listMonitorRecommendations engole falha de rede/API e devolve um
      // feed vazio (total: 0) — indistinguível de "não há nada nesse
      // nível". Nunca confiamos nisso pra colapsar uma seção que já
      // tinha vagas (ver mesmo guard em goToPage, abaixo).
      if (feed.total === 0 && total > 0) {
        setLoading(false);
        setLoadError(true);
        return;
      }
      setItems(feed.items);
      setTotal(feed.total);
      setPage(1);
      setLoading(false);
      setLoadError(false);
    });
    return () => {
      cancelled = true;
    };
  }, [sort, level, pageSize]);

  async function goToPage(nextPage: number) {
    lastRequestedPage.current = nextPage;
    setLoading(true);
    setLoadError(false);
    const feed = await listMonitorRecommendations(
      nextPage,
      pageSize,
      false,
      level,
      sort,
    );
    // Mesma proteção: uma falha silenciosa nunca deve fazer uma seção com
    // vagas de verdade sumir da tela — mantém o que já estava mostrado e
    // oferece tentar de novo.
    if (feed.total === 0 && total > 0) {
      setLoading(false);
      setLoadError(true);
      return;
    }
    setItems(feed.items);
    setTotal(feed.total);
    setPage(nextPage);
    setLoading(false);
  }

  function handleViewed(recommendationId: string) {
    setItems((current) =>
      current.map((item) =>
        item.recommendationId === recommendationId && item.isNew
          ? { ...item, isNew: false, viewedAt: new Date().toISOString() }
          : item,
      ),
    );
    void markRecommendationViewed(recommendationId);
  }

  function handleDismiss(recommendationId: string) {
    setItems((current) =>
      current.filter((item) => item.recommendationId !== recommendationId),
    );
    setTotal((current) => Math.max(0, current - 1));
    void dismissRecommendation(recommendationId);
  }

  function handleFeedback(
    recommendationId: string,
    feedback: MonitorRecommendationFeedback,
    feedbackReason?: MonitorRecommendationFeedbackReason,
  ) {
    setItems((current) =>
      current.map((item) =>
        item.recommendationId === recommendationId
          ? { ...item, feedback, feedbackReason: feedbackReason ?? null }
          : item,
      ),
    );
    void submitRecommendationFeedback(
      recommendationId,
      feedback,
      feedbackReason,
    );
  }

  if (total === 0) return null;

  const info = OPPORTUNITY_LEVELS[level] ?? OPPORTUNITY_LEVELS[0];
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);
  const hasPrev = page > 1;
  const hasNext = end < total;

  return (
    <div style={{ marginBottom: 36 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginBottom: 14,
          flexWrap: "wrap",
        }}
      >
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: info.ring,
            flexShrink: 0,
          }}
        />
        <p
          style={{
            margin: 0,
            fontFamily: MONO,
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: 0.08,
            textTransform: "uppercase",
            color: info.fg,
          }}
        >
          {info.label}
        </p>
        <span style={{ fontFamily: MONO, fontSize: 11, color: "#8a8a85" }}>
          · {total}
        </span>
        <div
          style={{ flex: 1, height: 1, background: "rgba(10,10,10,0.08)" }}
        />
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            flexShrink: 0,
          }}
        >
          <span style={{ fontFamily: MONO, fontSize: 10.5, color: "#8a8a85" }}>
            {start}–{end} de {total}
          </span>
          <button
            type="button"
            aria-label={`Página anterior de ${info.label}`}
            disabled={!hasPrev || loading}
            onClick={() => goToPage(page - 1)}
            style={{
              width: 24,
              height: 24,
              borderRadius: 6,
              border: `1px solid rgba(10,10,10,${hasPrev ? 0.15 : 0.1})`,
              background: "#fff",
              color: hasPrev ? "#0a0a0a" : "#c8c6bf",
              cursor: hasPrev && !loading ? "pointer" : "default",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <ChevronLeft />
          </button>
          <button
            type="button"
            aria-label={`Próxima página de ${info.label}`}
            disabled={!hasNext || loading}
            onClick={() => goToPage(page + 1)}
            style={{
              width: 24,
              height: 24,
              borderRadius: 6,
              border: `1px solid rgba(10,10,10,${hasNext ? 0.15 : 0.1})`,
              background: "#fff",
              color: hasNext ? "#0a0a0a" : "#c8c6bf",
              cursor: hasNext && !loading ? "pointer" : "default",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <ChevronRight />
          </button>
        </div>
      </div>

      {loadError ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            background: "rgba(239,68,68,0.06)",
            border: "1px solid rgba(239,68,68,0.2)",
            borderRadius: 10,
            padding: "10px 14px",
            marginBottom: 12,
          }}
        >
          <span style={{ fontSize: 12.5, color: "#7a2a1f" }}>
            Não foi possível carregar essas vagas agora.
          </span>
          <button
            type="button"
            onClick={() => goToPage(lastRequestedPage.current)}
            style={{
              border: "none",
              background: "transparent",
              color: "#7a2a1f",
              fontSize: 12.5,
              fontWeight: 600,
              textDecoration: "underline",
              cursor: "pointer",
              flexShrink: 0,
            }}
          >
            Tentar de novo
          </button>
        </div>
      ) : null}

      <div
        className="monitor-level-grid"
        style={{ opacity: loading ? 0.6 : 1 }}
      >
        {items.map((item) => (
          <MonitorRecommendationCard
            key={item.recommendationId}
            item={item}
            onViewed={handleViewed}
            onDismiss={handleDismiss}
            onFeedback={handleFeedback}
          />
        ))}
      </div>
    </div>
  );
}
