"use server";

import { getCurrentAppUserFromCookies } from "./app-session.server";
import { hasAvailableCredits } from "./plan-credits";
import { getMyPlan } from "./plans-api";

export async function getAuthStatus(): Promise<{
  isAuthenticated: boolean;
  userName: string | null;
  hasCredits: boolean | null;
}> {
  const user = await getCurrentAppUserFromCookies();

  if (!user) {
    return {
      isAuthenticated: false,
      userName: null,
      hasCredits: null,
    };
  }

  try {
    const plan = await getMyPlan();
    return {
      isAuthenticated: true,
      userName: user.name ?? null,
      hasCredits: hasAvailableCredits({
        creditsRemaining: plan.creditsRemaining,
      }),
    };
  } catch {
    return {
      isAuthenticated: true,
      userName: user.name ?? null,
      hasCredits: null,
    };
  }
}
