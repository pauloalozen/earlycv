import type { SeniorityLevel } from "@prisma/client";
import { SeniorityLevel as SeniorityLevelEnum } from "@prisma/client";

import { SENIORITY_LADDER } from "../radar/matching.engine";

// Compartilhado por MonitorMatchingWorker (1 vaga x N perfis) e
// MonitorProfileMatchingWorker (1 perfil x N vagas) — janela de
// senioridade usada só no PRÉ-FILTRO (não é o critério final de pontuação,
// isso é MatchingEngine.calculateScore, chamado em memória só para quem
// passa aqui). Folga maior que a usada dentro de calculateScore para não
// descartar no pré-filtro um candidato que ainda pontuaria alto o
// suficiente pela força de outras dimensões (área/skills).
export function nearbySeniorities(
  seniority: SeniorityLevel,
  maxDistance: number,
): SeniorityLevel[] {
  const index = SENIORITY_LADDER.indexOf(seniority);
  // UNKNOWN sempre incluso no pré-filtro: um lado sem senioridade inferida
  // não pode ser descartado aqui — calculateScore trata UNKNOWN como "sem
  // dado suficiente pra penalizar" (pontuação intermediária), nunca elimina
  // por si só.
  if (index === -1) {
    return [...SENIORITY_LADDER, SeniorityLevelEnum.UNKNOWN];
  }
  const nearby = SENIORITY_LADDER.filter(
    (_, i) => Math.abs(i - index) <= maxDistance,
  );
  return [...nearby, SeniorityLevelEnum.UNKNOWN];
}
