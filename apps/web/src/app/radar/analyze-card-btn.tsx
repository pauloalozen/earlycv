"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { analyzeMasterCvForJob } from "@/lib/analyze-master-cv-flow";
import { AnalyzingOverlay } from "./analyzing-overlay";
import { AdaptBtn, scoreTier } from "./radar-ui";
import { useTurnstileAnalyzeToken } from "./turnstile-analyze-context";

const GEIST = "var(--font-geist), -apple-system, system-ui, sans-serif";

function Spinner() {
  return (
    <span
      aria-hidden
      style={{
        width: 11,
        height: 11,
        borderRadius: "50%",
        border: "2px solid rgba(250,250,246,0.35)",
        borderTopColor: "#fafaf6",
        display: "inline-block",
        animation: "analyze-card-btn-spin 0.7s linear infinite",
      }}
    />
  );
}

// Botão "Analisar meu CV" da listagem de vagas (/radar, /radar-salvas):
// mesma regra do card de detalhe (analysis-cta.tsx) — com CV master,
// dispara a análise direto (sem passar por /adaptar), mostra loading no
// próprio botão e redireciona pro resultado. Sem CV master, cai pro link
// simples pra /adaptar de sempre (AdaptBtn).
export function AnalyzeCardBtn({
  masterResumeId,
  radarJobId,
  jobDescriptionText,
  adaptarUrl,
  score,
  fullWidth = false,
}: {
  masterResumeId: string | null;
  radarJobId: string;
  jobDescriptionText: string;
  adaptarUrl: string;
  score?: number | null;
  fullWidth?: boolean;
}) {
  const router = useRouter();
  const requestToken = useTurnstileAnalyzeToken();
  const [loading, setLoading] = useState(false);

  if (!masterResumeId) {
    return <AdaptBtn href={adaptarUrl} score={score} fullWidth={fullWidth} />;
  }

  async function handleClick() {
    if (loading) return;
    setLoading(true);
    try {
      const turnstileToken = await requestToken();
      const result = await analyzeMasterCvForJob({
        masterResumeId: masterResumeId as string,
        radarJobId,
        // Este botão só existe na listagem do Radar (/radar, /vagas-salvas)
        // — nunca no card de recomendação do Alerta, que tem seu próprio
        // link (monitor-recommendation-card.tsx) direto pro detalhe da
        // vaga, sem análise inline.
        radarJobOrigin: "radar",
        jobDescriptionText,
        turnstileToken,
      });
      if (!result.ok) {
        setLoading(false);
        return;
      }
      router.push(`/adaptar/resultado?adaptationId=${result.adaptationId}`);
    } catch {
      setLoading(false);
    }
  }

  const hasScore = typeof score === "number";
  const tier = hasScore ? scoreTier(score as number) : null;

  return (
    <>
      <style>{`
        @keyframes analyze-card-btn-spin { to { transform: rotate(360deg); } }
      `}</style>
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        style={{
          display: fullWidth ? "flex" : "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
          width: fullWidth ? "100%" : undefined,
          boxSizing: "border-box",
          background: "#0a0a0a",
          color: "#fafaf6",
          border: "none",
          borderRadius: 8,
          padding: "9px 13px",
          fontSize: 11.5,
          fontWeight: 500,
          cursor: loading ? "default" : "pointer",
          opacity: loading ? 0.75 : 1,
          fontFamily: GEIST,
          whiteSpace: "nowrap",
          boxShadow:
            hasScore && tier === "high"
              ? "0 0 0 1.5px rgba(47,168,76,0.4), 0 4px 14px rgba(0,0,0,0.14)"
              : "none",
        }}
      >
        {loading ? (
          <Spinner />
        ) : (
          <svg
            aria-hidden
            width="11"
            height="11"
            viewBox="0 0 24 24"
            fill="#c6ff3a"
          >
            <title>Analisar</title>
            <path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" />
          </svg>
        )}
        {loading ? "Analisando..." : "Analisar meu CV"}
      </button>
      {loading ? <AnalyzingOverlay /> : null}
    </>
  );
}
