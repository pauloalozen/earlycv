import type { Period } from "@/app/admin/_components/period-selector";

// Corte de data da visão geral do /admin. Compartilhado com o drill-down
// em /admin/usuarios (?loginPeriod=) pra lista bater com o número do card.

const VALID_PERIODS: Period[] = ["hoje", "7d", "30d", "mes"];

export function isAdminPeriod(raw?: string): raw is Period {
  return VALID_PERIODS.includes(raw as Period);
}

export function resolveAdminPeriod(raw?: string): Period {
  return isAdminPeriod(raw) ? raw : "30d";
}

export function getAdminPeriodSince(period: Period): Date {
  const now = new Date();
  switch (period) {
    case "hoje":
      return new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
      );
    case "7d":
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    case "mes":
      return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    default:
      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  }
}

export function adminPeriodSubLabel(period: Period): string {
  switch (period) {
    case "hoje":
      return "hoje";
    case "7d":
      return "últimos 7 dias";
    case "30d":
      return "últimos 30 dias";
    case "mes":
      return "este mês";
  }
}
