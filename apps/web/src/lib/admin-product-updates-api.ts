import "server-only";

import { getBackofficeSessionToken } from "./backoffice-session.server";

export type ProductUpdateStatus =
  | "DRAFT"
  | "READY"
  | "SENDING"
  | "COMPLETED"
  | "CANCELLED"
  | "FAILED";
// Nomes internos preservados de propósito (não renomeados na migration,
// ver schema.prisma) — a interface admin mostra "Internos"/"Pagantes"/
// "Toda a base", nunca estes valores brutos.
export type ProductUpdateAudience =
  | "INTERNAL_TEST"
  | "PAID"
  | "ALL_ELIGIBLE_USERS";
export type ProductUpdateDeliveryStatus =
  | "PENDING"
  | "PROCESSING"
  | "SENT"
  | "FAILED"
  | "OUTCOME_UNKNOWN"
  | "CANCELLED";
export type ProductUpdateEventType =
  | "SENT"
  | "DELIVERED"
  | "OPENED"
  | "CLICKED"
  | "BOUNCED"
  | "COMPLAINED"
  | "REJECTED"
  | "SUBSCRIPTION";

export type ProductUpdate = {
  id: string;
  internalName: string;
  subject: string;
  preheader: string | null;
  content: string;
  primaryButtonText: string | null;
  primaryButtonUrl: string | null;
  optionalFooterContent: string | null;
  htmlSnapshot: string | null;
  textSnapshot: string | null;
  audience: ProductUpdateAudience | null;
  status: ProductUpdateStatus;
  recipientCount: number;
  testSentAt: string | null;
  testSentBy: string | null;
  testRecipientEmail: string | null;
  createdBy: string;
  startedBy: string | null;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  failedAt: string | null;
};

export type ProductUpdateStats = {
  sent: number;
  failed: number;
  outcomeUnknown: number;
  cancelled: number;
  pending: number;
  processing: number;
  uniqueOpened: number;
  uniqueClicked: number;
  bounced: number;
  complained: number;
};

export type ProductUpdateDelivery = {
  id: string;
  productUpdateId: string;
  userId: string | null;
  recipientEmail: string;
  recipientName: string | null;
  status: ProductUpdateDeliveryStatus;
  attempts: number;
  lastError: string | null;
  sentAt: string | null;
  providerMessageId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ProductUpdateEvent = {
  id: string;
  deliveryId: string | null;
  type: ProductUpdateEventType;
  occurredAt: string;
  metadataJson: Record<string, unknown> | null;
};

function getApiBaseUrl() {
  const configuredBaseUrl =
    process.env.API_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    "http://localhost:4000";

  return configuredBaseUrl.endsWith("/api")
    ? configuredBaseUrl
    : `${configuredBaseUrl}/api`;
}

async function resolveToken(token?: string) {
  const sessionToken = token ?? (await getBackofficeSessionToken());
  if (!sessionToken) {
    throw new Error("Missing backoffice session token.");
  }
  return sessionToken;
}

async function apiRequest<T>(path: string, token?: string, init?: RequestInit) {
  const bearerToken = await resolveToken(token);

  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    ...init,
    cache: "no-store" as const,
    headers: {
      Authorization: `Bearer ${bearerToken}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    throw new Error(`API ${response.status}: ${await response.text()}`);
  }

  const text = await response.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export function listProductUpdates(
  params: { page?: number; limit?: number } = {},
  token?: string,
) {
  const qs = new URLSearchParams();
  if (params.page) qs.set("page", String(params.page));
  if (params.limit) qs.set("limit", String(params.limit));
  const suffix = qs.toString();
  return apiRequest<{
    items: ProductUpdate[];
    total: number;
    page: number;
    limit: number;
  }>(`/admin/product-updates${suffix ? `?${suffix}` : ""}`, token);
}

export function getProductUpdateDetail(id: string, token?: string) {
  return apiRequest<{
    productUpdate: ProductUpdate;
    stats: ProductUpdateStats;
  }>(`/admin/product-updates/${id}`, token);
}

export function createProductUpdate(
  input: {
    internalName: string;
    subject: string;
    preheader?: string;
    content: string;
    primaryButtonText?: string;
    primaryButtonUrl?: string;
    optionalFooterContent?: string;
  },
  token?: string,
) {
  return apiRequest<ProductUpdate>("/admin/product-updates", token, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateProductUpdate(
  id: string,
  input: Partial<{
    subject: string;
    preheader: string | null;
    content: string;
    primaryButtonText: string | null;
    primaryButtonUrl: string | null;
    optionalFooterContent: string | null;
  }>,
  token?: string,
) {
  return apiRequest<ProductUpdate>(`/admin/product-updates/${id}`, token, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function previewProductUpdate(
  id: string,
  input: { withName?: boolean } = {},
  token?: string,
) {
  return apiRequest<{ html: string; text: string }>(
    `/admin/product-updates/${id}/preview`,
    token,
    { method: "POST", body: JSON.stringify(input) },
  );
}

export function sendTestProductUpdate(
  id: string,
  recipientEmail: string,
  token?: string,
) {
  return apiRequest<ProductUpdate>(
    `/admin/product-updates/${id}/send-test`,
    token,
    { method: "POST", body: JSON.stringify({ recipientEmail }) },
  );
}

export function markProductUpdateReady(id: string, token?: string) {
  return apiRequest<ProductUpdate>(
    `/admin/product-updates/${id}/ready`,
    token,
    {
      method: "POST",
    },
  );
}

export function getProductUpdateEligibleCount(
  id: string,
  audience: ProductUpdateAudience,
  token?: string,
) {
  return apiRequest<{ count: number }>(
    `/admin/product-updates/${id}/eligible-count?audience=${audience}`,
    token,
  );
}

export function startProductUpdate(
  id: string,
  input: { audience: ProductUpdateAudience; confirmedRecipientCount: number },
  token?: string,
) {
  return apiRequest<ProductUpdate>(
    `/admin/product-updates/${id}/start`,
    token,
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
}

export function cancelProductUpdate(id: string, token?: string) {
  return apiRequest<ProductUpdate>(
    `/admin/product-updates/${id}/cancel`,
    token,
    { method: "POST" },
  );
}

export function listProductUpdateDeliveries(
  id: string,
  params: { page?: number; limit?: number } = {},
  token?: string,
) {
  const qs = new URLSearchParams();
  if (params.page) qs.set("page", String(params.page));
  if (params.limit) qs.set("limit", String(params.limit));
  const suffix = qs.toString();
  return apiRequest<{
    items: ProductUpdateDelivery[];
    total: number;
    page: number;
    limit: number;
  }>(
    `/admin/product-updates/${id}/deliveries${suffix ? `?${suffix}` : ""}`,
    token,
  );
}

export function getProductUpdateDeliveryTimeline(
  productUpdateId: string,
  deliveryId: string,
  token?: string,
) {
  return apiRequest<{
    delivery: ProductUpdateDelivery;
    events: ProductUpdateEvent[];
  }>(
    `/admin/product-updates/${productUpdateId}/deliveries/${deliveryId}/timeline`,
    token,
  );
}
