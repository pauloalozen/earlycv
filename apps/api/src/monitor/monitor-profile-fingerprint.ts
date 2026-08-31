import { createHash } from "node:crypto";
import type { ScorableProfile } from "../radar/matching.engine";

// Hash determinístico só dos campos que MatchingEngine.calculateScore
// realmente consome de UserRadarProfile (areas/skills/technologies/
// seniority/languages/preferredWorkModels — ver ScorableProfile em
// matching.engine.ts). Deliberadamente NÃO inclui certifications,
// preferredContractTypes, openToRelocation, salaryExpectationMin,
// careerFingerprint ou sourceResumeId: nenhum desses é lido por
// calculateScore hoje, então mudanças neles não tornam nenhuma
// UserJobRecommendation existente stale e não devem disparar rematch.
//
// Usado como versão do perfil no matching do Meu Monitor
// (MonitorProfileMatchingWorker) — permite (a) pular rematch quando um
// PUT /monitor/profile não mudou nada relevante ao score, e (b) detectar,
// ao final de um processamento, se o perfil mudou de novo enquanto o
// worker rodava (nesse caso o job volta para PENDING em vez de COMPLETED,
// pra não deixar um resultado calculado com perfil antigo "vencer").
export function computeMonitorMatchFingerprint(
  profile: Pick<
    ScorableProfile,
    | "areas"
    | "skills"
    | "technologies"
    | "seniority"
    | "languages"
    | "preferredWorkModels"
  >,
): string {
  const canonical = JSON.stringify({
    areas: [...profile.areas].sort(),
    languages: [...profile.languages].map((l) => l.toLowerCase()).sort(),
    preferredWorkModels: [...profile.preferredWorkModels]
      .map((m) => m.toLowerCase())
      .sort(),
    seniority: profile.seniority,
    skills: [...profile.skills].map((s) => s.toLowerCase()).sort(),
    technologies: [...profile.technologies].map((t) => t.toLowerCase()).sort(),
  });

  return createHash("sha256").update(canonical).digest("hex");
}
