export type ParsedBrickPayload =
  | {
      kind: "pix";
      paymentMethodId: "pix";
      payerEmail: string;
      payerIdentification?: { type: string; number: string };
    }
  | {
      kind: "card";
      paymentMethodId: string;
      token: string;
      installments: number;
      issuerId?: number;
      payerEmail?: string;
      payerIdentification?: { type: string; number: string };
    };

export class BrickPayloadValidationError extends Error {
  constructor(
    readonly code:
      | "brick_payload_invalid"
      | "brick_payment_method_not_supported",
    message: string,
  ) {
    super(message);
  }
}

type LooseObject = Record<string, unknown>;

export function parseBrickPaymentPayload(input: unknown): ParsedBrickPayload {
  if (!input || typeof input !== "object") {
    throw new BrickPayloadValidationError(
      "brick_payload_invalid",
      "Payload de pagamento invalido.",
    );
  }

  const payload = input as LooseObject;
  const paymentMethodId = normalizeString(payload.payment_method_id);
  if (!paymentMethodId) {
    throw new BrickPayloadValidationError(
      "brick_payload_invalid",
      "Metodo de pagamento invalido.",
    );
  }

  if (isBlockedPaymentMethod(paymentMethodId)) {
    throw new BrickPayloadValidationError(
      "brick_payment_method_not_supported",
      "Metodo de pagamento nao suportado.",
    );
  }

  if (paymentMethodId === "pix") {
    const payerEmail = getPayerEmail(payload);
    if (!payerEmail) {
      throw new BrickPayloadValidationError(
        "brick_payload_invalid",
        "Email do pagador obrigatorio para Pix.",
      );
    }

    return {
      kind: "pix",
      paymentMethodId: "pix",
      payerEmail,
      payerIdentification: getPayerIdentification(payload),
    };
  }

  const token = normalizeString(payload.token);
  const installments = parseInstallments(payload.installments);
  if (!token || !installments) {
    throw new BrickPayloadValidationError(
      "brick_payment_method_not_supported",
      "Metodo de pagamento nao suportado.",
    );
  }

  return {
    kind: "card",
    paymentMethodId,
    token,
    installments,
    issuerId: parseIssuerId(payload.issuer_id),
    payerEmail: getPayerEmail(payload) ?? undefined,
    payerIdentification: getPayerIdentification(payload),
  };
}

function parseInstallments(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value) && value >= 1) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    if (Number.isInteger(parsed) && parsed >= 1) {
      return parsed;
    }
  }
  return null;
}

function parseIssuerId(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return undefined;
}

function getPayerEmail(payload: LooseObject): string | null {
  const payer = asObject(payload.payer);
  const email = normalizeString(payer?.email);
  if (!email) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

function getPayerIdentification(
  payload: LooseObject,
): { type: string; number: string } | undefined {
  const payer = asObject(payload.payer);
  const identification = asObject(payer?.identification);
  const type = normalizeString(identification?.type);
  const number = normalizeString(identification?.number);
  if (!type || !number) return undefined;
  return { type, number };
}

function asObject(value: unknown): LooseObject | null {
  if (!value || typeof value !== "object") return null;
  return value as LooseObject;
}

function normalizeString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function isBlockedPaymentMethod(paymentMethodId: string): boolean {
  const normalized = paymentMethodId.toLowerCase();
  if (normalized === "ticket") return true;
  if (normalized.startsWith("bol")) return true;
  return false;
}
