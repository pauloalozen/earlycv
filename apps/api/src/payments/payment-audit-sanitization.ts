type SafeErrorLike = {
  cause?: unknown;
  code?: unknown;
  message?: unknown;
  name?: unknown;
  status?: unknown;
  statusCode?: unknown;
};

const MAX_ERROR_TEXT_LENGTH = 500;

function toTrimmedString(value: unknown, maxLength = MAX_ERROR_TEXT_LENGTH) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  return trimmed.slice(0, maxLength);
}

function toSafeScalar(value: unknown): string | number | boolean | null {
  if (value === null) return null;
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "boolean") return value;
  return null;
}

function pickObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

export function sanitizePaymentAuditPayload(
  payload: unknown,
  correlation?: { correlationId?: string | null; requestId?: string | null },
): Record<string, unknown> | null {
  const source = pickObject(payload);
  const sanitized: Record<string, unknown> = {
    receivedAt: new Date().toISOString(),
  };

  const requestId = toTrimmedString(correlation?.requestId, 128);
  const correlationId = toTrimmedString(correlation?.correlationId, 128);
  if (requestId) sanitized.requestId = requestId;
  if (correlationId) sanitized.correlationId = correlationId;

  if (!source) {
    return Object.keys(sanitized).length > 0 ? sanitized : null;
  }

  const topLevelKeys = [
    "id",
    "type",
    "action",
    "topic",
    "paymentId",
    "externalReference",
    "preferenceId",
    "merchantOrderId",
    "status",
    "statusDetail",
    "purchaseId",
    "internalCheckoutId",
  ] as const;

  for (const key of topLevelKeys) {
    const value = toSafeScalar(source[key]);
    if (value !== null) {
      sanitized[key] = value;
    }
  }

  const data = pickObject(source.data);
  const dataId = toSafeScalar(data?.id);
  if (dataId !== null) {
    sanitized.data = { id: dataId };
  }

  return Object.keys(sanitized).length > 0 ? sanitized : null;
}

export function summarizeSafeError(error: unknown): string {
  if (error instanceof Error) {
    const code = toTrimmedString((error as SafeErrorLike).code, 64);
    const name = toTrimmedString(error.name, 64) ?? "Error";
    const message = toTrimmedString(error.message) ?? "unknown_error";
    const cause = toTrimmedString((error as SafeErrorLike).cause);
    const status =
      typeof (error as SafeErrorLike).status === "number"
        ? (error as SafeErrorLike).status
        : typeof (error as SafeErrorLike).statusCode === "number"
          ? (error as SafeErrorLike).statusCode
          : null;

    return [
      `${name}:${message}`,
      code ? `code=${code}` : null,
      status ? `status=${status}` : null,
      cause ? `cause=${cause}` : null,
    ]
      .filter(Boolean)
      .join("; ");
  }

  if (typeof error === "string") {
    return toTrimmedString(error) ?? "unknown_provider_error";
  }

  if (typeof error === "number" || typeof error === "boolean") {
    return String(error);
  }

  const objectError = pickObject(error);
  if (!objectError) {
    return "unknown_provider_error";
  }

  const name = toTrimmedString(objectError.name, 64) ?? "UnknownError";
  const message = toTrimmedString(objectError.message) ?? "unknown_error";
  const code = toTrimmedString(objectError.code, 64);
  const status =
    typeof objectError.status === "number"
      ? objectError.status
      : typeof objectError.statusCode === "number"
        ? objectError.statusCode
        : null;

  return [
    `${name}:${message}`,
    code ? `code=${code}` : null,
    status ? `status=${status}` : null,
  ]
    .filter(Boolean)
    .join("; ");
}
