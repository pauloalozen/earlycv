"use server";

import { getCurrentAppUserFromCookies } from "./app-session.server";
import { hasAvailableCredits } from "./plan-credits";
import { getMyPlan } from "./plans-api";
import { getMyMasterResume } from "./resumes-api";

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

export async function getAdaptarAuthStatus(): Promise<{
  isAuthenticated: boolean;
  userName: string | null;
  hasMasterResume: boolean;
  masterResumeId: string | null;
}> {
  const user = await getCurrentAppUserFromCookies();

  if (!user) {
    return {
      isAuthenticated: false,
      userName: null,
      hasMasterResume: false,
      masterResumeId: null,
    };
  }

  try {
    const masterResume = await getMyMasterResume();

    return {
      isAuthenticated: true,
      userName: user.name ?? null,
      hasMasterResume: Boolean(masterResume),
      masterResumeId: masterResume?.id ?? null,
    };
  } catch {
    return {
      isAuthenticated: true,
      userName: user.name ?? null,
      hasMasterResume: false,
      masterResumeId: null,
    };
  }
}
