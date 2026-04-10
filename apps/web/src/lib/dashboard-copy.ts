export const DASHBOARD_METRIC_LABELS = {
  averageScore: "Seu score médio",
  matchCount: "Vagas que combinam com você",
  recentImprovement: "Melhoria recente",
} as const;

type DashboardOverviewInput = {
  analyzed: number;
  generated: number;
  availableCredits: number | string;
};

export function formatDashboardOverview({
  analyzed,
  generated,
  availableCredits,
}: DashboardOverviewInput) {
  const availableCreditsCopy =
    availableCredits === "Ilimitado"
      ? "Créditos disponíveis: Ilimitado"
      : `${availableCredits} créditos disponíveis`;

  return {
    analyzed: `${analyzed} CVs analisados`,
    generated: `${generated} versões geradas`,
    availableCredits: availableCreditsCopy,
  };
}
