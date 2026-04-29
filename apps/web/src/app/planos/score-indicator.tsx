"use client";

import { useEffect, useState } from "react";
import type { CvAnalysisData } from "@/lib/cv-adaptation-api";
import { extractDashboardAnalysisSignal } from "@/lib/dashboard-test-metrics";

const MONO = "var(--font-geist-mono), monospace";
const GEIST = "var(--font-geist), -apple-system, system-ui, sans-serif";

export function ScoreIndicator({
  adaptationId,
  initialScore = null,
  initialProjectedScore = null,
}: {
  adaptationId?: string;
  initialScore?: number | null;
  initialProjectedScore?: number | null;
}) {
  const [score, setScore] = useState<number | null>(initialScore);
  const [scoreProjetado, setScoreProjetado] = useState<number | null>(
    initialProjectedScore,
  );

  useEffect(() => {
    if (!adaptationId) return;

    let cancelled = false;

    fetch(`/api/cv-adaptation/${adaptationId}/content`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        return response.json() as Promise<{
          adaptedContentJson?: CvAnalysisData;
        }>;
      })
      .then((payload) => {
        const raw = payload.adaptedContentJson;
        if (!raw || cancelled) return;
        const signal = extractDashboardAnalysisSignal(raw);
        const baseScore = signal.adjustments.scoreBefore;
        const projected = signal.adjustments.scoreFinal;
        if (typeof baseScore === "number") {
          setScore(baseScore);
        }
        if (typeof projected === "number") {
          setScoreProjetado(projected);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setScore(null);
          setScoreProjetado(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [adaptationId]);

  useEffect(() => {
    if (adaptationId) return;
    try {
      const stored = sessionStorage.getItem("guestAnalysis");
      if (stored) {
        const parsed = JSON.parse(stored) as {
          adaptedContentJson: CvAnalysisData;
        };
        if (parsed?.adaptedContentJson) {
          const signal = extractDashboardAnalysisSignal(
            parsed.adaptedContentJson,
          );
          setScore(signal.adjustments.scoreBefore);
          setScoreProjetado(signal.adjustments.scoreFinal);
          return;
        }
      }
      const fallback = sessionStorage.getItem("lastAnalysisScore");
      if (fallback) {
        const parsed = JSON.parse(fallback) as {
          score: number;
          scoreProjetado?: number;
        };
        if (typeof parsed?.score === "number") {
          setScore(parsed.score);
          if (typeof parsed.scoreProjetado === "number")
            setScoreProjetado(parsed.scoreProjetado);
        }
      }
    } catch {
      // sem análise prévia — não exibir score
    }
  }, [adaptationId]);

  if (score === null) return null;

  return (
    <div
      style={{
        background: "#fafaf6",
        border: "1px solid rgba(10,10,10,0.08)",
        borderRadius: 14,
        padding: "16px 24px 14px",
        marginBottom: 20,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 10,
      }}
    >
      {/* Three metrics */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexWrap: "wrap",
          gap: 0,
        }}
      >
        {/* Score atual */}
        <div style={{ textAlign: "center", padding: "4px 22px" }}>
          <p
            style={{
              fontFamily: MONO,
              fontSize: 9.5,
              letterSpacing: 1.1,
              color: "#45443e",
              fontWeight: 700,
              margin: "0 0 5px",
              textTransform: "uppercase" as const,
            }}
          >
            Seu score atual
          </p>
          <p
            style={{
              fontSize: 28,
              fontWeight: 600,
              color: "#f59e0b",
              fontVariantNumeric: "tabular-nums",
              margin: 0,
              letterSpacing: -1,
              lineHeight: 1,
            }}
          >
            {score}
          </p>
        </div>

        <span
          style={{
            fontFamily: GEIST,
            fontSize: 20,
            color: "rgba(10,10,10,0.15)",
            lineHeight: 1,
          }}
        >
          |
        </span>

        {/* Meta recomendada */}
        <div style={{ textAlign: "center", padding: "4px 22px" }}>
          <p
            style={{
              fontFamily: MONO,
              fontSize: 9.5,
              letterSpacing: 1.1,
              color: "#45443e",
              fontWeight: 700,
              margin: "0 0 5px",
              textTransform: "uppercase" as const,
            }}
          >
            Meta recomendada da vaga
          </p>
          <p
            style={{
              fontSize: 28,
              fontWeight: 600,
              color: "#84cc16",
              fontVariantNumeric: "tabular-nums",
              margin: 0,
              letterSpacing: -1,
              lineHeight: 1,
            }}
          >
            85+
          </p>
        </div>

        {scoreProjetado !== null && (
          <>
            <span
              style={{
                fontFamily: GEIST,
                fontSize: 20,
                color: "rgba(10,10,10,0.15)",
                lineHeight: 1,
              }}
            >
              |
            </span>

            {/* Score pós ajuste */}
            <div style={{ textAlign: "center", padding: "4px 22px" }}>
              <p
                style={{
                  fontFamily: MONO,
                  fontSize: 9.5,
                  letterSpacing: 1.1,
                  color: "#45443e",
                  fontWeight: 700,
                  margin: "0 0 5px",
                  textTransform: "uppercase" as const,
                }}
              >
                Seu score pós ajuste
              </p>
              <p
                style={{
                  fontSize: 28,
                  fontWeight: 600,
                  color: "#4d7c0f",
                  fontVariantNumeric: "tabular-nums",
                  margin: 0,
                  letterSpacing: -1,
                  lineHeight: 1,
                }}
              >
                {scoreProjetado}
              </p>
            </div>
          </>
        )}
      </div>

      {/* Message */}
      <p
        style={{
          fontFamily: GEIST,
          fontSize: 12.5,
          fontWeight: 500,
          color: "#6a6560",
          margin: 0,
          textAlign: "center",
          lineHeight: 1.45,
        }}
      >
        Otimize seu CV e{" "}
        <span style={{ color: "#0a0a0a" }}>
          aumente suas chances de ser chamado para entrevista
        </span>
      </p>
    </div>
  );
}
