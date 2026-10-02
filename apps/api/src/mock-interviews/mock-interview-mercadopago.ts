import { createHmac, timingSafeEqual } from "node:crypto";

import { Injectable, Logger } from "@nestjs/common";
import MercadoPagoConfig, { Payment } from "mercadopago";

import type { ParsedBrickPayload } from "../payments/brick-payload";
import {
  MOCK_INTERVIEW_PRODUCT,
  resolveApiUrl,
  toExternalReference,
} from "./mock-interview.config";

// Integração com o Mercado Pago da Entrevista Simulada. Mesmo checkout dos
// planos (Payment Brick: o pagamento acontece dentro do EarlyCV), com as
// MESMAS credenciais, mas external_reference e notification_url próprios —
// nada aqui altera PaymentsService/PlansService.

export type NormalizedMpPayment = {
  paymentId: string;
  status: "approved" | "refunded" | "failed" | "pending";
  rawStatus: string | null;
  statusDetail: string | null;
  externalReference: string | null;
  preferenceId: string | null;
  merchantOrderId: string | null;
  paymentMethod: string | null;
  paidAmountInCents: number | null;
  paidCurrency: string | null;
};

type RawMpPayment = {
  id?: string | number;
  status?: string;
  status_detail?: string;
  external_reference?: string;
  preference_id?: string;
  order?: { id?: number | string };
  payment_type_id?: string;
  transaction_amount?: number;
  currency_id?: string;
  date_created?: string;
};

export function normalizeMpPayment(
  raw: RawMpPayment,
): NormalizedMpPayment | null {
  const paymentId =
    typeof raw.id === "number"
      ? String(raw.id)
      : typeof raw.id === "string" && raw.id.trim()
        ? raw.id.trim()
        : null;
  if (!paymentId) return null;

  const rawStatus = raw.status ?? null;
  // refunded/charged_back = foi pago e voltou; rejected/cancelled = nunca
  // foi pago. Os dois nunca se misturam.
  const status: NormalizedMpPayment["status"] =
    rawStatus === "approved"
      ? "approved"
      : rawStatus === "refunded" || rawStatus === "charged_back"
        ? "refunded"
        : rawStatus === "rejected" || rawStatus === "cancelled"
          ? "failed"
          : "pending";

  return {
    paymentId,
    status,
    rawStatus,
    statusDetail: raw.status_detail ?? null,
    externalReference: raw.external_reference ?? null,
    preferenceId: raw.preference_id ?? null,
    merchantOrderId: raw.order?.id != null ? String(raw.order.id) : null,
    paymentMethod: raw.payment_type_id?.trim() || null,
    paidAmountInCents:
      typeof raw.transaction_amount === "number"
        ? Math.round(raw.transaction_amount * 100)
        : null,
    paidCurrency: raw.currency_id?.trim() || null,
  };
}

export type SignatureCheck =
  | "valid"
  | "no_secret_configured"
  | "missing"
  | "bad_format"
  | "mismatch";

// Mesma regra de PlansService.verifyWebhookSignature (manifest
// id:{data.id};request-id:{x-request-id};ts:{ts}; com HMAC-SHA256), como
// função pura para ser testável.
export function checkMercadoPagoSignature(input: {
  secrets: string[];
  body: unknown;
  xSignature?: string;
  xRequestId?: string;
}): SignatureCheck {
  if (input.secrets.length === 0) return "no_secret_configured";
  if (!input.xSignature) return "missing";

  const parts: Record<string, string> = {};
  for (const part of input.xSignature.split(",")) {
    const [k, v] = part.split("=");
    if (k && v) parts[k.trim()] = v.trim();
  }
  if (!parts.ts || !parts.v1) return "bad_format";

  const body = input.body;
  const dataId =
    body !== null &&
    typeof body === "object" &&
    "data" in body &&
    body.data !== null &&
    typeof body.data === "object" &&
    "id" in body.data
      ? String((body.data as { id: unknown }).id)
      : "";

  const message = `id:${dataId};request-id:${input.xRequestId ?? ""};ts:${parts.ts};`;
  const received = Buffer.from(parts.v1);
  const matches = input.secrets.some((secret) => {
    const expected = Buffer.from(
      createHmac("sha256", secret).update(message).digest("hex"),
    );
    return (
      expected.length === received.length && timingSafeEqual(expected, received)
    );
  });
  return matches ? "valid" : "mismatch";
}

export function extractWebhookPaymentId(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const data = body as Record<string, unknown>;
  if (data.type !== "payment") return null;
  const inner =
    typeof data.data === "object" && data.data !== null
      ? (data.data as Record<string, unknown>).id
      : null;
  if (typeof inner === "number") return String(inner);
  if (typeof inner === "string" && inner.trim()) return inner.trim();
  return null;
}

function isMpProduction(): boolean {
  return (
    process.env.MERCADOPAGO_MODE === "production" ||
    process.env.NODE_ENV === "production"
  );
}

// Mesma resolução de token do Brick de PaymentsService.getBrickAccessToken.
function getAccessToken(): string | null {
  const explicit = process.env.MERCADOPAGO_BRICK_ACCESS_TOKEN?.trim();
  if (explicit) return explicit;
  if (isMpProduction()) {
    return process.env.MERCADOPAGO_ACCESS_TOKEN?.trim() || null;
  }
  return (
    process.env.MERCADOPAGO_BRICK_ACCESS_TOKEN_TEST?.trim() ||
    process.env.MERCADOPAGO_ACCESS_TOKEN_TEST?.trim() ||
    process.env.MERCADOPAGO_ACCESS_TOKEN?.trim() ||
    null
  );
}

// URL absoluta do webhook próprio. Em produção exige https (o MP recusa
// notification_url inválida e o pagamento nunca seria confirmado).
export function resolveMockInterviewNotificationUrl(): string | null {
  const raw = resolveApiUrl().trim();
  let base: URL;
  try {
    base = new URL(raw);
  } catch {
    return null;
  }
  if (base.protocol !== "https:" && base.protocol !== "http:") return null;
  if (process.env.NODE_ENV === "production" && base.protocol !== "https:") {
    return null;
  }
  const basePath = base.pathname.replace(/\/$/, "");
  base.pathname = basePath.endsWith("/api")
    ? `${basePath}/mock-interviews/webhook/mercadopago`
    : `${basePath}/api/mock-interviews/webhook/mercadopago`;
  base.search = "";
  base.hash = "";
  return base.toString();
}

export function splitPayerName(fullName: string | null): {
  firstName: string;
  lastName: string;
} {
  const parts = (fullName ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: "Cliente", lastName: "EarlyCV" };
  if (parts.length === 1) return { firstName: parts[0], lastName: "EarlyCV" };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

export type BrickPaymentResult = {
  payment: NormalizedMpPayment | null;
  qrCodeBase64: string | null;
  qrCodeText: string | null;
};

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function extractPixData(response: unknown): {
  qrCodeBase64: string | null;
  qrCodeText: string | null;
} {
  const data = (
    response as {
      point_of_interaction?: {
        transaction_data?: { qr_code_base64?: unknown; qr_code?: unknown };
      };
    } | null
  )?.point_of_interaction?.transaction_data;
  return {
    qrCodeBase64: optionalString(data?.qr_code_base64),
    qrCodeText: optionalString(data?.qr_code),
  };
}

export function getMercadoPagoWebhookSecrets(): string[] {
  return Array.from(
    new Set(
      [
        process.env.MERCADOPAGO_PRO_WEBHOOK_SECRET,
        process.env.MERCADOPAGO_BRICK_WEBHOOK_SECRET,
        process.env.MERCADOPAGO_WEBHOOK_SECRET,
      ]
        .map((value) => value?.trim() ?? "")
        .filter((value) => value.length > 0),
    ),
  );
}

export class MercadoPagoNotConfiguredError extends Error {
  constructor() {
    super("Mercado Pago token not configured.");
  }
}

@Injectable()
export class MockInterviewMercadoPagoGateway {
  private readonly logger = new Logger(MockInterviewMercadoPagoGateway.name);

  private client(): MercadoPagoConfig {
    const token = getAccessToken();
    if (!token) throw new MercadoPagoNotConfiguredError();
    return new MercadoPagoConfig({ accessToken: token });
  }

  // Cria o pagamento a partir do formulário do Payment Brick (cartão com
  // token ou Pix). O valor vem SEMPRE do pedido (nunca do front).
  async createBrickPayment(input: {
    purchaseId: string;
    userId: string;
    amountInCents: number;
    payload: ParsedBrickPayload;
    payerEmail: string;
    payerName: string | null;
    notificationUrl: string;
    idempotencyKey: string;
  }): Promise<BrickPaymentResult> {
    const { payload } = input;
    const name = splitPayerName(input.payerName);
    const response = await new Payment(this.client()).create({
      body: {
        transaction_amount: input.amountInCents / 100,
        payment_method_id: payload.paymentMethodId,
        ...(payload.kind === "card"
          ? {
              token: payload.token,
              installments: payload.installments,
              ...(payload.issuerId ? { issuer_id: payload.issuerId } : {}),
            }
          : {}),
        payer: {
          email: input.payerEmail,
          first_name: name.firstName,
          last_name: name.lastName,
          ...(payload.payerIdentification
            ? { identification: payload.payerIdentification }
            : {}),
        },
        external_reference: toExternalReference(input.purchaseId),
        description: "EarlyCV - entrevista simulada ao vivo",
        metadata: {
          purchaseId: input.purchaseId,
          userId: input.userId,
          flow: "mock_interview",
          source: "payment_brick",
        },
        notification_url: input.notificationUrl,
        statement_descriptor: "EARLYCV",
        additional_info: {
          items: [
            {
              id: "mock-interview",
              title: MOCK_INTERVIEW_PRODUCT.title,
              description: "Entrevista simulada ao vivo no EarlyCV",
              category_id: "services",
              quantity: 1,
              unit_price: input.amountInCents / 100,
            },
          ],
          payer: { first_name: name.firstName, last_name: name.lastName },
        },
      },
      requestOptions: { idempotencyKey: input.idempotencyKey },
    });

    return {
      payment: normalizeMpPayment(response as unknown as RawMpPayment),
      ...extractPixData(response),
    };
  }

  async getPayment(paymentId: string): Promise<NormalizedMpPayment | null> {
    const payment = await new Payment(this.client()).get({ id: paymentId });
    return normalizeMpPayment(payment as unknown as RawMpPayment);
  }

  // Pagamento mais recente com este external_reference (reconciliação quando
  // o webhook atrasa ou não chega).
  async findLatestByExternalReference(
    externalReference: string,
  ): Promise<NormalizedMpPayment | null> {
    const result = await new Payment(this.client()).search({
      options: {
        external_reference: externalReference,
        sort: "date_created",
        criteria: "desc",
      },
    });
    const results = (result.results ?? []) as RawMpPayment[];
    // Um aprovado (ou estornado) sempre vence um pendente/recusado mais novo.
    const normalized = results
      .map(normalizeMpPayment)
      .filter((p): p is NormalizedMpPayment => p !== null);
    return (
      normalized.find((p) => p.status === "refunded") ??
      normalized.find((p) => p.status === "approved") ??
      normalized[0] ??
      null
    );
  }

  logError(context: string, error: unknown) {
    this.logger.error(
      `[mock-interview:mp] ${context}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
