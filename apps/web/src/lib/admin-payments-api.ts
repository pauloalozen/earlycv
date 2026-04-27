import "server-only";

import { getBackofficeSessionToken } from "./backoffice-session.server";

export type PaymentListRecord = {
  checkoutId: string;
  type: "plan" | "adaptation";
  userId: string;
  userEmail: string | null;
  planName: string | null;
  status: string;
  mpPaymentId: string | null;
  mpPreferenceId: string | null;
  externalReference: string | null;
  amountInCents: number | null;
  createdAt: string;
  updatedAt: string;
};

export type PaymentAuditEntry = {
  id: string;
  eventType: string;
  actionTaken: string;
  mpPaymentId: string | null;
  mpMerchantOrderId: string | null;
  mpStatus: string | null;
  errorMessage: string | null;
  createdAt: string;
};

export type PaymentDetailRecord = {
  checkout: PaymentListRecord;
  auditLogs: PaymentAuditEntry[];
};

export type PaymentListResponse = {
  items: PaymentListRecord[];
  total: number;
};

export type ReconcileResult = {
  reconciled: boolean;
  message: string;
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

export async function listAdminPayments(params: {
  type?: "plan" | "adaptation";
  status?: string;
  userId?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}): Promise<PaymentListResponse> {
  const qs = new URLSearchParams();
  if (params.type) qs.set("type", params.type);
  if (params.status) qs.set("status", params.status);
  if (params.userId) qs.set("userId", params.userId);
  if (params.from) qs.set("from", params.from);
  if (params.to) qs.set("to", params.to);
  if (params.page) qs.set("page", String(params.page));
  if (params.limit) qs.set("limit", String(params.limit));

  return apiRequest<PaymentListResponse>(`/payments/admin/list?${qs}`);
}

export async function getAdminPaymentDetail(
  checkoutId: string,
): Promise<PaymentDetailRecord> {
  return apiRequest<PaymentDetailRecord>(`/payments/admin/${checkoutId}`);
}

export async function reconcileAdminPayment(
  checkoutId: string,
): Promise<ReconcileResult> {
  return apiRequest<ReconcileResult>(
    `/payments/admin/reconcile/${checkoutId}`,
    { method: "POST" },
  );
}

export async function reconcileAllPending(): Promise<{
  reconciledPlans: number;
  reconciledAdaptations: number;
  total: number;
}> {
  return apiRequest(`/payments/admin/reconcile-all`, { method: "POST" });
}
