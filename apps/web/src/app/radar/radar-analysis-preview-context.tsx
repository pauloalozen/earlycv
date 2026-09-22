"use client";

import { createContext, type ReactNode, useContext, useState } from "react";

type RadarAnalysisPreviewState = {
  hasPreview: boolean;
  markPreviewRevealed: () => void;
};

const RadarAnalysisPreviewContext =
  createContext<RadarAnalysisPreviewState | null>(null);

// Ponte de estado entre RadarGuestAnalysisBand (no topo da página, onde o
// preview é de fato revelado) e EndOfDescriptionCta (no fim da descrição,
// que precisa saber se já existe um preview pra trocar a copy/destino do
// CTA de "veja se seu CV se encaixa" pra "libere sua análise completa").
// Os dois componentes são "use client" separados dentro da mesma
// page.tsx (Server Component) — sem um contexto comum eles não teriam
// como saber do estado um do outro.
export function RadarAnalysisPreviewProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [hasPreview, setHasPreview] = useState(false);

  return (
    <RadarAnalysisPreviewContext.Provider
      value={{
        hasPreview,
        markPreviewRevealed: () => setHasPreview(true),
      }}
    >
      {children}
    </RadarAnalysisPreviewContext.Provider>
  );
}

// Fora do provider, nunca deveria acontecer nesta página — mas devolve um
// estado neutro (nunca revelado) em vez de lançar, pra não quebrar o
// componente por um erro de composição.
export function useRadarAnalysisPreview(): RadarAnalysisPreviewState {
  const ctx = useContext(RadarAnalysisPreviewContext);
  return ctx ?? { hasPreview: false, markPreviewRevealed: () => {} };
}
