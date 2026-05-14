const PROHIBITED_KEYWORDS = [
  "cv",
  "resume",
  "curriculum",
  "jobdescription",
  "job_description",
  "descriptiontext",
  "adaptedcontent",
  "adaptedcontentjson",
  "previewtext",
  "aiauditjson",
  "email",
  "phone",
  "telefone",
  "name",
  "nome",
  "cpf",
  "document",
  "payer",
  "card",
  "token",
  "pdf",
  "file",
  "rawpayload",
  "body",
  "password",
  "refreshtoken",
  "accesstoken",
] as const;
const PROHIBITED_KEY_SET = new Set(PROHIBITED_KEYWORDS);

const SAFE_UTM_KEYS = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
]);

function normalizeKey(key: string) {
  return key.replace(/[^a-zA-Z0-9_]/g, "").toLowerCase();
}

function isProhibitedKey(key: string): boolean {
  const normalized = normalizeKey(key);
  return PROHIBITED_KEY_SET.has(normalized);
}

function looksLikeEmail(value: string): boolean {
  return value.includes("@");
}

function sanitizeLeadCode(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed || looksLikeEmail(trimmed)) return undefined;
  if (!/^[A-Za-z0-9_-]{3,64}$/.test(trimmed)) return undefined;
  return trimmed;
}

function sanitizePathLikeValue(value: unknown): string | null | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return null;

  try {
    const parsed = new URL(trimmed, "https://earlycv.local");
    return parsed.pathname || "/";
  } catch {
    const qIndex = trimmed.indexOf("?");
    return (qIndex >= 0 ? trimmed.slice(0, qIndex) : trimmed) || "/";
  }
}

function sanitizeReferrerValue(value: unknown): string | null | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.includes("?")) return null;
  return sanitizePathLikeValue(trimmed) ?? null;
}

function toSafeScalar(value: unknown): string | number | boolean | null | undefined {
  if (value === null) return null;
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "boolean") return value;
  return undefined;
}

export function sanitizeAnalyticsPayload(
  input: Record<string, unknown> | undefined,
): Record<string, unknown> {
  if (!input || typeof input !== "object") {
    return {};
  }

  const output: Record<string, unknown> = {};

  for (const [rawKey, rawValue] of Object.entries(input)) {
    const key = rawKey.trim();
    if (!key) continue;

    if (SAFE_UTM_KEYS.has(key)) {
      const scalar = toSafeScalar(rawValue);
      if (scalar !== undefined) output[key] = scalar;
      continue;
    }

    if (key === "leadCode" || key === "lead_code") {
      const safeLeadCode = sanitizeLeadCode(rawValue);
      if (safeLeadCode) {
        output[key] = safeLeadCode;
      }
      continue;
    }

    if (isProhibitedKey(key)) {
      continue;
    }

    if (key === "url" || key === "page_location") {
      const safePath = sanitizePathLikeValue(rawValue);
      if (safePath !== undefined) output[key] = safePath;
      continue;
    }

    if (key === "search") {
      output[key] = null;
      continue;
    }

    if (key === "referrer" || key === "page_referrer") {
      const safeReferrer = sanitizeReferrerValue(rawValue);
      if (safeReferrer !== undefined) output[key] = safeReferrer;
      continue;
    }

    if (key === "pathname" || key === "route" || key === "page_path") {
      const safePath = sanitizePathLikeValue(rawValue);
      if (safePath !== undefined) output[key] = safePath;
      continue;
    }

    if (Array.isArray(rawValue)) {
      const sanitizedArray = rawValue
        .map((entry) => {
          if (typeof entry === "object" && entry !== null) {
            return sanitizeAnalyticsPayload(entry as Record<string, unknown>);
          }
          return toSafeScalar(entry);
        })
        .filter((entry) => entry !== undefined);
      output[key] = sanitizedArray;
      continue;
    }

    if (typeof rawValue === "object" && rawValue !== null) {
      const nested = sanitizeAnalyticsPayload(rawValue as Record<string, unknown>);
      if (Object.keys(nested).length > 0) {
        output[key] = nested;
      }
      continue;
    }

    const scalar = toSafeScalar(rawValue);
    if (scalar !== undefined) {
      output[key] = scalar;
    }
  }

  return output;
}

export function summarizeWebhookPayload(body: unknown): {
  action: string | null;
  eventType: string | null;
  hasBody: boolean;
  keys: string[];
  paymentId: string | null;
} {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return {
      action: null,
      eventType: null,
      hasBody: body != null,
      keys: [],
      paymentId: null,
    };
  }

  const record = body as Record<string, unknown>;
  const data =
    record.data && typeof record.data === "object" && !Array.isArray(record.data)
      ? (record.data as Record<string, unknown>)
      : null;

  return {
    action: typeof record.action === "string" ? record.action : null,
    eventType: typeof record.type === "string" ? record.type : null,
    hasBody: true,
    keys: Object.keys(record).slice(0, 30),
    paymentId:
      typeof record.id === "string"
        ? record.id
        : typeof data?.id === "string"
          ? data.id
          : null,
  };
}
