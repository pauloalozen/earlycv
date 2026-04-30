export type AnalyticsEnv = "production" | "staging" | "development";

export const ANALYTICS_APP = "earlycv" as const;

type ResolveAnalyticsEnvInput = {
  appEnv?: string | null;
  platformEnv?: string | null;
  nodeEnv?: string | null;
};

function normalizeCandidate(value?: string | null): string | null {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) {
    return null;
  }
  return normalized;
}

export function resolveAnalyticsEnv(
  input: ResolveAnalyticsEnvInput,
): AnalyticsEnv {
  const candidate =
    normalizeCandidate(input.appEnv) ??
    normalizeCandidate(input.platformEnv) ??
    normalizeCandidate(input.nodeEnv);

  if (candidate === "production") {
    return "production";
  }

  if (candidate === "staging" || candidate === "preview") {
    return "staging";
  }

  return "development";
}
