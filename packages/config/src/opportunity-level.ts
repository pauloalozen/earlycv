// Faixas de categoria de aderência do Radar de Oportunidades / Meu Monitor
// (0=Não recomendada .. 5=Excelente oportunidade) — fonte única de verdade
// para converter score numérico (0-100, ver MatchingEngine.calculateScore em
// apps/api/src/radar/matching.engine.ts) em nível de oportunidade.
// Antes desta extração, backend (matching.engine.ts) e frontend
// (radar-ui.tsx) mantinham cópias independentes destes thresholds, com
// risco de dessincronização (documentado como TODO nos dois arquivos). Todo
// consumidor — API ou Web — deve importar daqui, nunca reimplementar.
export const OPPORTUNITY_LEVEL_THRESHOLDS = [
  [90, 5],
  [75, 4],
  [55, 3],
  [35, 2],
  [15, 1],
  [0, 0],
] as const;

export type OpportunityLevel = 0 | 1 | 2 | 3 | 4 | 5;

export function scoreToOpportunityLevel(score: number): OpportunityLevel {
  for (const [minScore, level] of OPPORTUNITY_LEVEL_THRESHOLDS) {
    if (score >= minScore) return level;
  }
  return 0;
}
