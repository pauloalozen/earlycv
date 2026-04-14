import type { UserPlanType } from "@prisma/client";

const SAO_PAULO_TZ = "America/Sao_Paulo";

function toPositiveInt(raw: string | undefined, fallback: number): number {
  const value = raw?.trim();

  if (!value || !/^\d+$/.test(value)) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function resolveDailyAnalysisLimit(
  planType: UserPlanType,
  env: NodeJS.ProcessEnv = process.env,
): number | null {
  if (planType === "unlimited") {
    return null;
  }

  const map = {
    free: toPositiveInt(env.QNT_AN_PLAN_FREE, 3),
    starter: toPositiveInt(env.QNT_AN_PLAN_STARTER, 6),
    pro: toPositiveInt(env.QNT_AN_PLAN_PRO, 9),
    turbo: toPositiveInt(env.QNT_AN_PLAN_TURBO, 30),
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
