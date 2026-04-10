"use client";

import { useEffect, useState } from "react";
import type { CvAnalysisData } from "@/lib/cv-adaptation-api";

export function ScoreIndicator() {
  const [score, setScore] = useState<number | null>(null);

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem("guestAnalysis");
      if (!stored) return;
      const parsed = JSON.parse(stored) as {
        adaptedContentJson: CvAnalysisData;
      };
      const s = parsed?.adaptedContentJson?.fit?.score;
      if (typeof s === "number") setScore(s);
    } catch {
      // sem análise prévia — não exibir
    }
  }, []);

  if (score === null) return null;

  const scoreColor =
    score >= 70 ? "#84cc16" : score >= 40 ? "#f59e0b" : "#ef4444";

  return (
    <div className="rounded-xl border border-[#E8E8E8] bg-white px-6 py-3 shadow-sm">
      <div className="flex items-center justify-center gap-4">
        <div className="text-center">
          <p className="text-[10px] font-bold uppercase tracking-widest text-[#AAAAAA]">
            Score atual
          </p>
          <p
            className="text-2xl font-bold tabular-nums"
            style={{ color: scoreColor }}
          >
            {score}%
          </p>
        </div>
        <div className="h-8 w-px bg-[#EEEEEE]" />
        <div className="text-center">
          <p className="text-[10px] font-bold uppercase tracking-widest text-[#AAAAAA]">
            Recomendado
          </p>
          <p className="text-2xl font-bold tabular-nums text-lime-600">85%+</p>
        </div>
        <div className="h-8 w-px bg-[#EEEEEE]" />
        <p className="max-w-[160px] text-xs font-semibold text-[#111111]">
          Otimize seu CV e chegue ao score recomendado para essa vaga
        </p>
      </div>
      <p className="mt-2 text-center text-xs text-[#888888]">
        Você pode estar sendo filtrado automaticamente por sistemas de
        recrutamento
      </p>
    </div>
  );
}
