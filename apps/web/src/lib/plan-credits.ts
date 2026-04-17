export type PlanCreditsInfo = {
  creditsRemaining: number | null;
};

export function hasAvailableCredits(plan: PlanCreditsInfo | null): boolean {
  if (!plan) return false;
  return plan.creditsRemaining === null || plan.creditsRemaining > 0;
}
