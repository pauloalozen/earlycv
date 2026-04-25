"use client";

import { useEffect, useState } from "react";
import type { CvAnalysisData } from "@/lib/cv-adaptation-api";

const MONO = "var(--font-geist-mono), monospace";
const GEIST = "var(--font-geist), -apple-system, system-ui, sans-serif";

export function ScoreIndicator() {
  const [score, setScore] = useState<number | null>(null);
  const [scoreProjetado, setScoreProjetado] = useState<number | null>(null);

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem("guestAnalysis");
      if (stored) {
        const parsed = JSON.parse(stored) as {
          adaptedContentJson: CvAnalysisData;
        };
        const s = parsed?.adaptedContentJson?.fit?.score;
        if (typeof s === "number") {
          setScore(s);
          const apiProjetado =
            parsed.adaptedContentJson?.fit?.score_pos_ajustes;
          if (typeof apiProjetado === "number") {
            setScoreProjetado(apiProjetado);
          } else {
            const totalAjustes = (
              parsed.adaptedContentJson?.ajustes_conteudo ?? []
            ).reduce((sum, a) => sum + (a.pontos ?? 0), 0);
            const totalKw = (
              parsed.adaptedContentJson?.keywords?.ausentes ?? []
            ).reduce((sum, k) => sum + (k.pontos ?? 0), 0);
            setScoreProjetado(Math.min(100, s + totalAjustes + totalKw));
          }
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
  }, []);

  if (score === null) {
    return (
      <div style={{ textAlign: "center", marginBottom: 14 }}>
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            fontFamily: MONO,
            fontSize: 10.5,
            letterSpacing: 1.2,
            fontWeight: 500,
            color: "#555",
            background: "rgba(10,10,10,0.04)",
            border: "1px solid rgba(10,10,10,0.06)",
            padding: "5px 10px",
            borderRadius: 999,
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: "#c6ff3a",
              boxShadow: "0 0 6px #c6ff3a",
              display: "inline-block",
            }}
          />
          PLANOS · EARLYCV
        </div>
      </div>
    );
  }

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
