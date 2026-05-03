import type { PlanInfo } from "./plans-api";

export function toHeaderAvailableCredits(
  plan: Pick<PlanInfo, "creditsRemaining"> | null,
): number | "∞" | "—" {
  if (!plan) {
    return "—";
  }

  return plan.creditsRemaining === null ? "∞" : plan.creditsRemaining;
}
