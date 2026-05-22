import "server-only";

import { getBackofficeSessionToken } from "./backoffice-session.server";

export type PaymentRecoveryEligibilityStatus =
  | "eligible"
  | "possibly_resolved"
  | "not_eligible";

export type PaymentRecoveryItem = {
  purchaseId: string;
  userId: string;
  userName: string | null;
  userEmail: string | null;
  originAction: string | null;
  jobTitle: string | null;
  score: number | null;
  hasAvailableCredits: boolean;
  ignored: boolean;
  alreadySent: boolean;
  eligibilityStatus: PaymentRecoveryEligibilityStatus;
  createdAt: string;
};

export type PaymentRecoveryPendingResponse = {
  items: PaymentRecoveryItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

type RawPaymentRecoveryItem = Omit<PaymentRecoveryItem, "alreadySent" | "score"> & {
  score?: number | null;
  scoreAfter?: number | null;
  recoveryEmailCount?: number;
  lastRecoveryEmailSentAt?: string | null;
  alreadySent?: boolean;
};

type RawPaymentRecoveryPendingResponse = Omit<PaymentRecoveryPendingResponse, "items"> & {
  items: RawPaymentRecoveryItem[];
};

export type PaymentRecoveryActionResult = {
  ok: boolean;
  status?: "sent" | "skipped" | "failed";
  reason?: string;
  message?: string;
};

function getApiBaseUrl() {
  const url =
    process.env.API_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    "http://localhost:4000";
  return url.endsWith("/api") ? url : `${url}/api`;
}

async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await getBackofficeSessionToken();
  if (!token) throw new Error("Missing backoffice session token.");

  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    throw new Error(`API ${response.status}: ${await response.text()}`);
  }

  return response.json() as Promise<T>;
}

export async function listAdminPaymentRecoveryPending(params: {
  eligibilityStatus?: string;
  originAction?: string;
  alreadySent?: string;
  hasAvailableCredits?: string;
  ignored?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}) {
  const qs = new URLSearchParams();
  if (params.eligibilityStatus) qs.set("eligibilityStatus", params.eligibilityStatus);
  if (params.originAction) qs.set("originAction", params.originAction);
  if (params.alreadySent) qs.set("alreadySent", params.alreadySent);
  if (params.hasAvailableCredits) qs.set("hasAvailableCredits", params.hasAvailableCredits);
  if (params.ignored) qs.set("ignored", params.ignored);
  if (params.dateFrom) qs.set("dateFrom", params.dateFrom);
  if (params.dateTo) qs.set("dateTo", params.dateTo);
  if (params.search) qs.set("search", params.search);
  if (params.page) qs.set("page", String(params.page));
  if (params.pageSize) qs.set("pageSize", String(params.pageSize));

  const response = await apiRequest<RawPaymentRecoveryPendingResponse>(
    `/admin/payment-recovery/pending?${qs.toString()}`,
  );

  return {
    ...response,
    items: response.items.map((item) => {
      const alreadySent =
        item.alreadySent ??
        (typeof item.recoveryEmailCount === "number"
          ? item.recoveryEmailCount > 0
          : Boolean(item.lastRecoveryEmailSentAt));
      return {
        ...item,
        score: item.score ?? item.scoreAfter ?? null,
        alreadySent,
      };
    }),
  } satisfies PaymentRecoveryPendingResponse;
}

export async function ignoreAdminPaymentRecoveryPurchase(
  purchaseId: string,
  reason?: string,
) {
  return apiRequest<PaymentRecoveryActionResult>(
    `/admin/payment-recovery/${purchaseId}/ignore`,
    {
      body: JSON.stringify(reason ? { reason } : {}),
      method: "POST",
    },
  );
}

export async function unignoreAdminPaymentRecoveryPurchase(purchaseId: string) {
  return apiRequest<PaymentRecoveryActionResult>(
    `/admin/payment-recovery/${purchaseId}/unignore`,
    { method: "POST" },
  );
}

export async function sendAdminPaymentRecoveryEmail(purchaseId: string) {
  return apiRequest<PaymentRecoveryActionResult>(
    `/admin/payment-recovery/${purchaseId}/send-email`,
    { method: "POST" },
  );
}
