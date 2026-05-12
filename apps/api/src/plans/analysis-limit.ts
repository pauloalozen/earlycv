import type { UserPlanType } from "@prisma/client";

const SAO_PAULO_TZ = "America/Sao_Paulo";

function requirePositiveInt(env: NodeJS.ProcessEnv, name: string): number {
  const raw = env[name]?.trim();
  if (!raw || !/^\d+$/.test(raw)) {
    throw new Error(`Required env var ${name} is not set or is not a positive integer`);
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Env var ${name} must be a positive integer, got: "${raw}"`);
  }
  return parsed;
}

export function resolveDailyAnalysisLimit(
  planType: UserPlanType,
  env: NodeJS.ProcessEnv = process.env,
): number | null {
  if (planType === "unlimited") {
    return null;
  }

  const map = {
    free: requirePositiveInt(env, "QNT_AN_PLAN_FREE"),
    starter: requirePositiveInt(env, "QNT_AN_PLAN_STARTER"),
    pro: requirePositiveInt(env, "QNT_AN_PLAN_PRO"),
    turbo: requirePositiveInt(env, "QNT_AN_PLAN_TURBO"),
  } as const;

  return map[planType];
}

export function buildSaoPauloUsageDate(now: Date): Date {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: SAO_PAULO_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(now);
  const yyyy = parts.find((part) => part.type === "year")?.value;
  const mm = parts.find((part) => part.type === "month")?.value;
  const dd = parts.find((part) => part.type === "day")?.value;

  if (!yyyy || !mm || !dd) {
    throw new Error("Failed to build Sao Paulo usage date");
  }

  return new Date(`${yyyy}-${mm}-${dd}T00:00:00-03:00`);
}
