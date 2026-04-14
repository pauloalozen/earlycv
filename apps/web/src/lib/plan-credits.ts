export type PlanCreditsInfo = {
  creditsRemaining: number | null;
  analysisCreditsRemaining: number | null;
};

export function hasAvailableCredits(plan: PlanCreditsInfo | null): boolean {
  if (!plan) return false;
  return plan.creditsRemaining === null || plan.creditsRemaining > 0;
}

export function hasAvailableAnalysisCredits(
  plan: PlanCreditsInfo | null,
): boolean {
  if (!plan) return false;
  return (
    plan.analysisCreditsRemaining === null ||
    (plan.analysisCreditsRemaining ?? 0) > 0
  );
}
