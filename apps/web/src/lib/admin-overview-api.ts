import "server-only";

import { getBackofficeSessionToken } from "./backoffice-session.server";

// Números da visão geral do /admin. Sempre agregados no banco (COUNT/SUM):
// nenhuma lista de usuários, currículos ou pagamentos trafega para montar
// estes cards.

export type AdminOverviewStats = {
  newUsers: number;
  totalAdaptedResumes: number;
  totalUsers: number;
};

export type AdminPaymentsSummary = {
  approvedCount: number;
  revenueInCents: number;
};

function getApiBaseUrl() {
  const url =
    process.env.API_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    "http://localhost:4000";
  return url.endsWith("/api") ? url : `${url}/api`;
}

async function apiRequest<T>(path: string): Promise<T> {
  const token = await getBackofficeSessionToken();
  if (!token) throw new Error("Missing backoffice session token.");

  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    cache: "no-store",
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    throw new Error(`API ${response.status}: ${await response.text()}`);
  }

  return response.json() as Promise<T>;
}

export function getAdminOverviewStats(from: string) {
  return apiRequest<AdminOverviewStats>(
    `/admin/dashboard/overview-stats?from=${encodeURIComponent(from)}`,
  );
}

// Só superadmin (mesma regra de /payments/admin/list); admin comum recebe 403
// e a página mostra "—", como antes.
export function getAdminPaymentsSummary(from: string) {
  return apiRequest<AdminPaymentsSummary>(
    `/payments/admin/summary?from=${encodeURIComponent(from)}`,
  );
}
