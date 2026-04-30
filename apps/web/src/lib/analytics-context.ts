const ANALYTICS_APP = "earlycv" as const;

export type FrontendAnalyticsContext = {
  app: "earlycv";
  env: "production" | "staging" | "development";
};

function normalizeCandidate(value?: string | null): string | null {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) {
    return null;
  }
  return normalized;
}

function resolveFrontendAnalyticsEnv(): FrontendAnalyticsContext["env"] {
  const candidate =
    normalizeCandidate(process.env.NEXT_PUBLIC_APP_ENV) ??
    normalizeCandidate(process.env.NEXT_PUBLIC_VERCEL_ENV) ??
    normalizeCandidate(process.env.NODE_ENV);

  if (candidate === "production") {
    return "production";
  }

  if (candidate === "staging" || candidate === "preview") {
    return "staging";
  }

  return "development";
}

export function getFrontendAnalyticsContext(): FrontendAnalyticsContext {
  return {
    app: ANALYTICS_APP,
    env: resolveFrontendAnalyticsEnv(),
  };
}
