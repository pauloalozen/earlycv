import "server-only";

import { getBackofficeSessionToken } from "./backoffice-session.server";

export type MockInterviewSessionStatus =
  | "AWAITING_SCHEDULING"
  | "SCHEDULED"
  | "COMPLETED"
  | "NO_SHOW"
  | "CANCELLED"
  | "REFUNDED";

export type MockInterviewPaymentStatus =
  | "pending"
  | "paid"
  | "failed"
  | "refunded";

export type AdminMockInterviewListItem = {
  id: string;
  code: string;
  buyer: { id: string; name: string; email: string };
  amountInCents: number;
  currency: string;
  paymentStatus: MockInterviewPaymentStatus;
  sessionStatus: MockInterviewSessionStatus;
  scheduledAt: string | null;
  reportSentAt: string | null;
  origin: string;
  createdAt: string;
  paidAt: string | null;
};

export type AdminMockInterviewList = {
  items: AdminMockInterviewListItem[];
  page: number;
  limit: number;
  total: number;
  summary: {
    paidCount: number;
    revenueInCents: number;
    awaitingScheduling: number;
    scheduled: number;
    completed: number;
    noShow: number;
  };
};

export type AdminMockInterviewDetail = {
  id: string;
  code: string;
  buyer: { id: string; name: string; email: string };
  amountInCents: number;
  currency: string;
  paymentStatus: MockInterviewPaymentStatus;
  paymentStatusRaw: string;
  paymentMethod: string | null;
  mpPaymentId: string | null;
  paidAt: string | null;
  refundedAt: string | null;
  origin: string;
  application: {
    id: string;
    jobTitle: string;
    companyName: string;
    status: string;
    nextActionAt: string | null;
  } | null;
  policyVersion: string;
  policyAcceptedAt: string;
  sessionStatus: MockInterviewSessionStatus;
  scheduledAt: string | null;
  meetingUrl: string | null;
  completedAt: string | null;
  reportSentAt: string | null;
  rescheduleCount: number;
  adminNotes: string | null;
  notifications: {
    adminNotifiedAt: string | null;
    adminNotifyError: string | null;
    buyerNotifiedAt: string | null;
    buyerNotifyError: string | null;
  };
  refund: { eligible: boolean; reason: string };
  createdAt: string;
  events: {
    id: string;
    type: string;
    actor: string;
    fromValue: string | null;
    toValue: string | null;
    note: string | null;
    createdAt: string;
  }[];
};

export type AdminMockInterviewUpdate = {
  scheduledAt?: string | null;
  meetingUrl?: string | null;
  sessionStatus?: Exclude<MockInterviewSessionStatus, "REFUNDED">;
  adminNotes?: string | null;
  reportSent?: boolean;
};

function getApiBaseUrl() {
  const url =
    process.env.API_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    "http://localhost:4000";
  return url.endsWith("/api") ? url : `${url}/api`;
}

export class AdminMockInterviewApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
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
    const text = await response.text();
    let message = text;
    try {
      const parsed = JSON.parse(text) as { message?: string | string[] };
      if (parsed.message) {
        message = Array.isArray(parsed.message)
          ? parsed.message.join(" ")
          : parsed.message;
      }
    } catch {
      // corpo não-JSON: usa o texto cru
    }
    throw new AdminMockInterviewApiError(response.status, message);
  }
  return (await response.json()) as T;
}

export function listAdminMockInterviews(params: {
  page?: number;
  limit?: number;
  payment?: "paid" | "refunded" | "pending" | "all";
  session?: MockInterviewSessionStatus;
  q?: string;
}) {
  const query = new URLSearchParams();
  if (params.page) query.set("page", String(params.page));
  if (params.limit) query.set("limit", String(params.limit));
  if (params.payment) query.set("payment", params.payment);
  if (params.session) query.set("session", params.session);
  if (params.q) query.set("q", params.q);
  return request<AdminMockInterviewList>(`/admin/mock-interviews?${query}`);
}

export function getAdminMockInterview(id: string) {
  return request<AdminMockInterviewDetail>(
    `/admin/mock-interviews/${encodeURIComponent(id)}`,
  );
}

export function updateAdminMockInterview(
  id: string,
  body: AdminMockInterviewUpdate,
) {
  return request<AdminMockInterviewDetail>(
    `/admin/mock-interviews/${encodeURIComponent(id)}`,
    { method: "PATCH", body: JSON.stringify(body) },
  );
}

export const SESSION_STATUS_LABELS: Record<MockInterviewSessionStatus, string> =
  {
    AWAITING_SCHEDULING: "Aguardando agenda",
    SCHEDULED: "Agendada",
    COMPLETED: "Realizada",
    NO_SHOW: "Não compareceu",
    CANCELLED: "Cancelada",
    REFUNDED: "Estornada",
  };

export const PAYMENT_STATUS_LABELS: Record<MockInterviewPaymentStatus, string> =
  {
    pending: "Pendente",
    paid: "Pago",
    failed: "Recusado",
    refunded: "Estornado",
  };

export const ORIGIN_LABELS: Record<string, string> = {
  landing: "Landing",
  application_offer: "Oferta na candidatura",
  offer_email: "E-mail de oferta",
  showcase: "Landing principal",
  other: "Outro",
};
