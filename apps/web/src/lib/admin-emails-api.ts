import "server-only";

import { getBackofficeSessionToken } from "./backoffice-session.server";

export type EmailDispatchMode = "OFF" | "SHADOW" | "ALLOWLIST" | "LIVE";
export type EmailDispatchKind =
  | "WELCOME"
  | "FEEDBACK_FIRST_USE"
  | "FEEDBACK_SECOND_CALL"
  | "PURCHASE_CONFIRMATION";
export type EmailDispatchStatus =
  | "PENDING"
  | "PROCESSING"
  | "SENT"
  | "FAILED"
  | "OUTCOME_UNKNOWN"
  | "SKIPPED"
  | "CANCELLED";
export type EmailDispatchEventType =
  | "SENT"
  | "DELIVERED"
  | "BOUNCED"
  | "COMPLAINED"
  | "REJECTED";
export type EmailTemplateKey =
  | "WELCOME"
  | "FEEDBACK_FIRST_USE"
  | "FEEDBACK_SECOND_CALL"
  | "PURCHASE_PAID"
  | "PURCHASE_COUPON";

export type EmailSettings = {
  welcomeMode: EmailDispatchMode;
  feedbackMode: EmailDispatchMode;
  feedbackSecondCallMode: EmailDispatchMode;
  purchaseConfirmationMode: EmailDispatchMode;
  startAt: string | null;
  allowlist: string[];
  extraBlocklist: string[];
  updatedAt: string | null;
  updatedByAdminId: string | null;
};

export type UpdateEmailSettingsInput = {
  welcomeMode: EmailDispatchMode;
  feedbackMode: EmailDispatchMode;
  feedbackSecondCallMode: EmailDispatchMode;
  purchaseConfirmationMode: EmailDispatchMode;
  startAt: string | null;
  allowlist: string[];
  extraBlocklist: string[];
  confirmLive?: boolean;
};

export type Readiness = { ready: true } | { ready: false; reason: string };

export type EmailsOverview = {
  settings: EmailSettings;
  runtime: {
    transport: "real" | "fake";
    effectiveModes: Record<EmailDispatchKind, EmailDispatchMode>;
    relationshipReadiness: Readiness;
    purchaseReadiness: Readiness;
  };
  counts: {
    window: {
      period: EmailsPeriod | "custom";
      fromDate: string;
      toDate: string;
    };
    byKindStatus: Array<{
      kind: EmailDispatchKind;
      status: EmailDispatchStatus;
      count: number;
    }>;
    alertDigests: Array<{ status: EmailDispatchStatus; count: number }>;
    eventsWindowDays: number;
    events: Array<{ type: EmailDispatchEventType; count: number }>;
    suppressions: Array<{ reason: "HARD_BOUNCE" | "COMPLAINT"; count: number }>;
    missingPurchaseConfirmations: number;
  };
};

export type EmailTemplateVariable = { name: string; description: string };

export type EmailTemplateInfo = {
  key: EmailTemplateKey;
  label: string;
  description: string;
  variables: EmailTemplateVariable[];
  unsubscribeFooter: boolean;
  defaults: { subject: string; body: string };
  current: {
    key: EmailTemplateKey;
    subject: string;
    body: string;
    isCustom: boolean;
    version: number;
    updatedAt: string | null;
    updatedByAdminId: string | null;
  };
};

export type RenderedEmail = { subject: string; text: string; html: string };

export type EmailTemplatePreview = {
  errors: string[];
  rendered: RenderedEmail | null;
};

export type EmailTemplateSendTestResult =
  | {
      transport: "real" | "fake";
      sent: true;
      outcome: "SENT" | "FAILED" | "OUTCOME_UNKNOWN";
      dispatchId: string;
    }
  | { transport: "real" | "fake"; sent: false; reason: string };

export type EmailDispatchListItem = {
  id: string;
  kind: EmailDispatchKind;
  status: EmailDispatchStatus;
  skippedReason: string | null;
  variant: string | null;
  recipientEmail: string;
  scheduledFor: string;
  sentAt: string | null;
  attempts: number;
  lastError: string | null;
  provider: "RESEND" | "SES";
  isTest: boolean;
  referenceId: string | null;
  createdAt: string;
};

export type EmailDispatchDetail = EmailDispatchListItem & {
  expiresAt: string;
  providerMessageId: string | null;
  events: Array<{
    id: string;
    type: EmailDispatchEventType;
    occurredAt: string;
  }>;
};

export type EmailSuppressionItem = {
  id: string;
  email: string;
  reason: "HARD_BOUNCE" | "COMPLAINT";
  bounceSubType: string | null;
  sourceCategory: string | null;
  occurredAt: string;
};

export type Paginated<T> = {
  items: T[];
  total: number;
  page: number;
  limit: number;
};

export type MissingPurchaseConfirmations = {
  sinceHours: number;
  count: number;
  items: Array<{
    purchaseId: string;
    userId: string;
    planType: string;
    completedAt: string;
  }>;
};

export type RecoveryReport = {
  mode: EmailDispatchMode;
  sinceHours: number;
  missing: MissingPurchaseConfirmations["items"];
  recovered: number;
  applied: boolean;
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

// Só a mensagem legível do erro do Nest (class-validator devolve `message`
// como array) — nunca o JSON cru na tela do admin.
function parseApiErrorMessage(status: number, rawBody: string): string {
  try {
    const body = JSON.parse(rawBody) as { message?: string | string[] };
    if (Array.isArray(body.message)) return body.message.join(" ");
    if (typeof body.message === "string" && body.message) return body.message;
  } catch {
    // corpo não é JSON — cai no fallback abaixo.
  }
  return rawBody || `Erro ${status} ao chamar a API.`;
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
    throw new Error(
      parseApiErrorMessage(response.status, await response.text()),
    );
  }

  const text = await response.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

function qs(params: Record<string, string | number | boolean | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : "";
}

const post = (body: unknown): RequestInit => ({
  method: "POST",
  body: JSON.stringify(body),
});

export type EmailsPeriod = "hoje" | "semana" | "7d" | "mes" | "30d";

export type EmailsOverviewRange = {
  period?: EmailsPeriod;
  from?: string;
  to?: string;
};

export function getEmailsOverview(
  token?: string,
  range: EmailsOverviewRange = {},
) {
  const qs = new URLSearchParams();
  if (range.from && range.to) {
    qs.set("from", range.from);
    qs.set("to", range.to);
  } else if (range.period) {
    qs.set("period", range.period);
  }
  const suffix = qs.size > 0 ? `?${qs.toString()}` : "";
  return apiRequest<EmailsOverview>(`/admin/emails/overview${suffix}`, token);
}

export function getEmailSettings(token?: string) {
  return apiRequest<EmailSettings>("/admin/emails/settings", token);
}

export function updateEmailSettings(
  input: UpdateEmailSettingsInput,
  token?: string,
) {
  return apiRequest<EmailSettings>(
    "/admin/emails/settings",
    token,
    post(input),
  );
}

export function listEmailTemplates(token?: string) {
  return apiRequest<EmailTemplateInfo[]>("/admin/emails/templates", token);
}

export function previewEmailTemplate(
  key: EmailTemplateKey,
  input: { subject: string; body: string },
  token?: string,
) {
  return apiRequest<EmailTemplatePreview>(
    `/admin/emails/templates/${key}/preview`,
    token,
    post(input),
  );
}

export function updateEmailTemplate(
  key: EmailTemplateKey,
  input: { subject: string; body: string },
  token?: string,
) {
  return apiRequest<{ key: EmailTemplateKey; version: number }>(
    `/admin/emails/templates/${key}`,
    token,
    post(input),
  );
}

export function resetEmailTemplate(key: EmailTemplateKey, token?: string) {
  return apiRequest<{ key: EmailTemplateKey }>(
    `/admin/emails/templates/${key}/reset`,
    token,
    post({}),
  );
}

export function sendTestEmailTemplate(
  key: EmailTemplateKey,
  recipientEmail: string,
  token?: string,
) {
  return apiRequest<EmailTemplateSendTestResult>(
    `/admin/emails/templates/${key}/send-test`,
    token,
    post({ recipientEmail }),
  );
}

export function listEmailDispatches(
  params: {
    page?: number;
    limit?: number;
    group?: "relationship" | "purchase";
    kind?: EmailDispatchKind;
    status?: EmailDispatchStatus;
  } = {},
  token?: string,
) {
  return apiRequest<Paginated<EmailDispatchListItem>>(
    `/admin/emails/dispatches${qs(params)}`,
    token,
  );
}

export function getEmailDispatch(id: string, token?: string) {
  return apiRequest<EmailDispatchDetail>(
    `/admin/emails/dispatches/${encodeURIComponent(id)}`,
    token,
  );
}

export function listEmailSuppressions(
  params: { page?: number; limit?: number } = {},
  token?: string,
) {
  return apiRequest<Paginated<EmailSuppressionItem>>(
    `/admin/emails/suppressions${qs(params)}`,
    token,
  );
}

export function getMissingPurchaseConfirmations(
  sinceHours?: number,
  token?: string,
) {
  return apiRequest<MissingPurchaseConfirmations>(
    `/admin/emails/purchase-confirmations/missing${qs({ sinceHours })}`,
    token,
  );
}

export function recoverPurchaseConfirmations(
  sinceHours?: number,
  token?: string,
) {
  return apiRequest<RecoveryReport>(
    "/admin/emails/purchase-confirmations/recover",
    token,
    post(sinceHours ? { sinceHours } : {}),
  );
}
