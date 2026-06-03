import { normalizeData } from "@/app/adaptar/resultado/normalize-data";
import type { CvAnalysisData } from "@/lib/cv-adaptation-api";

export type DashboardMetricInput = {
  id: string;
  improvement: number | null;
  score: number | null;
};

type ExtractDashboardAnalysisSignalOptions = {
  selectedMissingKeywords?: string[];
};

type AnalysisSignal = {
  adjustments: {
    notes: string | null;
    scoreBefore: number | null;
    scoreFinal: number | null;
  };
  selectedMissingKeywords: string[];
  improvement: number | null;
  score: number | null;
};

function parseText(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function parseTextArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter(
        (item): item is string =>
          typeof item === "string" && item.trim().length > 0,
      )
    : [];
}

function parseNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeKeyword(value: string): string {
  return value.trim().toLocaleLowerCase("pt-BR");
}

function resolveCvAnalysisScores(
  adaptedContentJson: unknown,
  options: ExtractDashboardAnalysisSignalOptions = {},
) {
  const parsed =
    adaptedContentJson && typeof adaptedContentJson === "object"
      ? (adaptedContentJson as Record<string, unknown>)
      : null;

  if (!parsed) {
    return {
      scoreBefore: null,
      scoreAfter: null,
      selectedMissingKeywords: [],
    };
  }

  const payloadSelectedMissingKeywords = parseTextArray(
    parsed.selectedMissingKeywords,
  );
  const selectedMissingKeywords =
    options.selectedMissingKeywords &&
    options.selectedMissingKeywords.length > 0
      ? parseTextArray(options.selectedMissingKeywords).map((keyword) =>
          keyword.trim(),
        )
      : payloadSelectedMissingKeywords;

  const fit =
    parsed.fit && typeof parsed.fit === "object"
      ? (parsed.fit as Record<string, unknown>)
      : null;

  const looksNormalizedHistoricalPayload =
    !!fit &&
    (Array.isArray(parsed.positivos) ||
      Array.isArray(parsed.ajustes_conteudo) ||
      Array.isArray(parsed.ajustes_indisponiveis) ||
      Array.isArray(parsed.pontos_fortes) ||
      Array.isArray(parsed.lacunas) ||
      Boolean(parsed.keywords && typeof parsed.keywords === "object") ||
      Boolean(parsed.formato_cv && typeof parsed.formato_cv === "object") ||
      Boolean(parsed.ats_keywords && typeof parsed.ats_keywords === "object"));

  if (looksNormalizedHistoricalPayload) {
    try {
      const normalized = normalizeData(parsed as CvAnalysisData);
      const selectedSet = new Set(
        selectedMissingKeywords.map((keyword) => normalizeKeyword(keyword)),
      );
      const selectedKeywordsPoints = normalized.keywords.ausentes
        .filter((keyword) => selectedSet.has(normalizeKeyword(keyword.kw)))
        .reduce((sum, keyword) => sum + keyword.pontos, 0);

      return {
        scoreBefore: normalized.score.scoreAtualBase,
        scoreAfter: Math.min(
          100,
          normalized.score.scoreAposLiberarBase + selectedKeywordsPoints,
        ),
        selectedMissingKeywords,
      };
    } catch {
      // Preserve scalar fallbacks for malformed historical payloads.
    }
  }

  const projection =
    parsed.projecao_melhoria && typeof parsed.projecao_melhoria === "object"
      ? (parsed.projecao_melhoria as Record<string, unknown>)
      : null;
  const atsScore =
    parsed.atsScore && typeof parsed.atsScore === "object"
      ? (parsed.atsScore as Record<string, unknown>)
      : null;

  return {
    scoreBefore:
      parseNumber(parsed.scoreBefore) ??
      parseNumber(projection?.score_atual) ??
      null,
    scoreAfter:
      parseNumber(parsed.scoreAfter) ??
      parseNumber(parsed.score_pos_ajustes) ??
      parseNumber(atsScore?.after) ??
      parseNumber(fit?.score_pos_ajustes) ??
      parseNumber(projection?.score_pos_otimizacao) ??
      parseNumber(projection?.score_pos_ajustes) ??
      parseNumber(projection?.scoreAfter) ??
      parseNumber(fit?.score) ??
      null,
    selectedMissingKeywords,
  };
}

export function extractDashboardAnalysisSignal(
  adaptedContentJson: unknown,
  options: ExtractDashboardAnalysisSignalOptions = {},
): AnalysisSignal {
  const parsed =
    adaptedContentJson && typeof adaptedContentJson === "object"
      ? (adaptedContentJson as {
          fit?: { score?: unknown; score_pos_ajustes?: unknown };
          projecao_melhoria?: {
            score_atual?: unknown;
            score_pos_otimizacao?: unknown;
          };
          adaptation_notes?: unknown;
          selectedMissingKeywords?: unknown;
        })
      : {};

  const resolved = resolveCvAnalysisScores(parsed as CvAnalysisData, options);
  const scoreAtual = resolved.scoreBefore;
  const finalScore = resolved.scoreAfter;

  return {
    adjustments: {
      notes: parseText(parsed.adaptation_notes),
      scoreBefore: scoreAtual,
      scoreFinal: finalScore,
    },
    selectedMissingKeywords: resolved.selectedMissingKeywords,
    score: finalScore,
    improvement:
      scoreAtual !== null && finalScore !== null
        ? finalScore - scoreAtual
        : null,
  };
}

export function buildDashboardTestMetrics(items: DashboardMetricInput[]) {
  const scoreValues = items
    .map((item) => item.score)
    .filter((value): value is number => value !== null);
  const improvementValues = items
    .map((item) => item.improvement)
    .filter((value): value is number => value !== null);

  if (scoreValues.length === 0) {
    return {
      averageScore: 0,
      evolutionPercentage: improvementValues.length
        ? Math.round(
            improvementValues.reduce((sum, current) => sum + current, 0) /
              improvementValues.length,
          )
        : 0,
      highCompatibilityCount: 0,
    };
  }

  const averageScore = Math.round(
    scoreValues.reduce((sum, current) => sum + current, 0) / scoreValues.length,
  );
  const highCompatibilityCount = scoreValues.filter(
    (score) => score >= 80,
  ).length;
  const evolutionPercentage = improvementValues.length
    ? Math.round(
        improvementValues.reduce((sum, current) => sum + current, 0) /
          improvementValues.length,
      )
    : 0;

  return {
    averageScore,
    evolutionPercentage,
    highCompatibilityCount,
  };
}

export function buildDashboardTestHistoryView(item: DashboardMetricInput) {
  return {
    ...item,
  };
}

export function getDashboardScoreColor(score: number): string {
  if (score < 50) return "#dc2626";
  if (score < 70) return "#ca8a04";

  const capped = Math.max(70, Math.min(100, score));
  const ratio = (capped - 70) / 30;
  const start = { r: 132, g: 204, b: 22 }; // lime-500
  const end = { r: 22, g: 163, b: 74 }; // green-600

  const r = Math.round(start.r + (end.r - start.r) * ratio);
  const g = Math.round(start.g + (end.g - start.g) * ratio);
  const b = Math.round(start.b + (end.b - start.b) * ratio);

  return `rgb(${r}, ${g}, ${b})`;
}
