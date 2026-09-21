"use client";

import { createContext, type ReactNode, useContext, useState } from "react";

type RadarV2AnalysisPreviewState = {
  hasPreview: boolean;
  markPreviewRevealed: () => void;
};

const RadarV2AnalysisPreviewContext =
  createContext<RadarV2AnalysisPreviewState | null>(null);

// Fase 1.1 (Radar v2) — ponte de estado entre RadarGuestAnalysisBandV2 (no
// topo da página, onde o preview é de fato revelado) e EndOfDescriptionCta
// (no fim da descrição, que precisa saber se já existe um preview pra
// trocar a copy/destino do CTA de "veja se seu CV se encaixa" pra "libere
// sua análise completa"). Os dois componentes são "use client" separados
// dentro da mesma page.tsx (Server Component) — sem um contexto comum eles
// não teriam como saber do estado um do outro.
export function RadarV2AnalysisPreviewProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [hasPreview, setHasPreview] = useState(false);

  return (
    <RadarV2AnalysisPreviewContext.Provider
      value={{
        hasPreview,
        markPreviewRevealed: () => setHasPreview(true),
      }}
    >
      {children}
    </RadarV2AnalysisPreviewContext.Provider>
  );
}

// Fora do provider, nunca deveria acontecer nesta página — mas devolve um
// estado neutro (nunca revelado) em vez de lançar, pra não quebrar o
// componente por um erro de composição.
export function useRadarV2AnalysisPreview(): RadarV2AnalysisPreviewState {
  const ctx = useContext(RadarV2AnalysisPreviewContext);
  return ctx ?? { hasPreview: false, markPreviewRevealed: () => {} };
}
