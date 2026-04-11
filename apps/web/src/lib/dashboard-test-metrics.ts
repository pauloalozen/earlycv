export type DashboardMetricInput = {
  id: string;
  improvement: number | null;
  score: number | null;
};

type AnalysisSignal = {
  improvement: number | null;
  score: number | null;
};

function parseNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function extractDashboardAnalysisSignal(
  adaptedContentJson: unknown,
): AnalysisSignal {
  const parsed =
    adaptedContentJson && typeof adaptedContentJson === "object"
      ? (adaptedContentJson as {
          fit?: { score?: unknown };
          projecao_melhoria?: {
            score_atual?: unknown;
            score_pos_otimizacao?: unknown;
          };
        })
      : {};

  const fitScore = parseNumber(parsed.fit?.score);
  const scoreAtual = parseNumber(parsed.projecao_melhoria?.score_atual);
  const scorePosOtimizacao = parseNumber(
    parsed.projecao_melhoria?.score_pos_otimizacao,
  );

  return {
    score: fitScore ?? scorePosOtimizacao,
    improvement:
      scoreAtual !== null && scorePosOtimizacao !== null
        ? scorePosOtimizacao - scoreAtual
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
