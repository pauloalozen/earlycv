import { randomUUID } from "node:crypto";

import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import MercadoPagoConfig, { Payment, Preference } from "mercadopago";
import type { PreferenceResponse } from "mercadopago/dist/clients/preference/commonTypes";

import {
  buildMercadoPagoItemMetadata,
  buildMercadoPagoReturnConfig,
} from "../payments/mercado-pago-return-config";

export type PaymentIntent = {
  paymentReference: string;
  checkoutUrl: string;
  amountInCents: number;
  currency: string;
  mpPreferenceId: string | null;
};

export type WebhookPaymentResolution = {
  paymentReference: string | null;
  status: "approved" | "failed" | "pending" | "unknown";
  paymentId: string | null;
  merchantOrderId: string | null;
  preferenceId: string | null;
  rawStatus: string | null;
};

@Injectable()
export class CvAdaptationPaymentService {
  private readonly logger = new Logger(CvAdaptationPaymentService.name);
  private readonly provider: string;

  constructor() {
    this.provider = process.env.PAYMENT_PROVIDER || "mercadopago";
  }

  async createIntent(
    adaptationId: string,
    _userId: string,
    existingReference?: string,
  ): Promise<PaymentIntent> {
    if (this.provider === "mercadopago") {
      return this.createMercadoPagoIntent(adaptationId, existingReference);
    }

    throw new BadRequestException(
      `Payment provider ${this.provider} not supported`,
    );
  }

  private isMpProduction(): boolean {
    return (
      process.env.MERCADOPAGO_MODE === "production" ||
      process.env.NODE_ENV === "production"
    );
  }

  private getMercadoPagoClient(): MercadoPagoConfig {
    const isProduction = this.isMpProduction();
    const token = isProduction
      ? process.env.MERCADOPAGO_ACCESS_TOKEN
      : (process.env.MERCADOPAGO_ACCESS_TOKEN_TEST ??
        process.env.MERCADOPAGO_ACCESS_TOKEN);

    if (!token) {
      const varName = isProduction
        ? "MERCADOPAGO_ACCESS_TOKEN"
        : "MERCADOPAGO_ACCESS_TOKEN_TEST";
      throw new BadRequestException(`${varName} not configured.`);
    }

    return new MercadoPagoConfig({ accessToken: token });
  }

  private async createMercadoPagoIntent(
    adaptationId: string,
    existingReference?: string,
  ): Promise<PaymentIntent> {
    const client = this.getMercadoPagoClient();
    const preference = new Preference(client);

    const paymentReference = existingReference ?? randomUUID();
    const priceInReais = requireEnvInt("PRICE_PLAN_STARTER") / 100;

    const frontendUrl = process.env.FRONTEND_URL ?? "http://localhost:3000";
    const apiUrl =
      process.env.API_URL ??
      process.env.NEXT_PUBLIC_API_URL ??
      "http://localhost:4000";
    const notificationUrl = `${apiUrl}/api/cv-adaptation/webhook/mercadopago`;

    const isProduction = this.isMpProduction();
    const itemMetadata = buildMercadoPagoItemMetadata({
      flow: "cv_adaptation",
    });
    const returnConfig = buildMercadoPagoReturnConfig({
      frontendUrl,
      successPath: `/pagamento/concluido?checkoutId=${adaptationId}`,
      failurePath: `/pagamento/falhou?checkoutId=${adaptationId}`,
      pendingPath: `/pagamento/pendente?checkoutId=${adaptationId}`,
    });

    this.logger.log(
      `[mp:return-config] flow=cv_adaptation adaptationId=${adaptationId} frontendHost=${returnConfig.frontendHost} successUrlIsHttps=${String(returnConfig.successUrlIsHttps)} autoReturnEnabled=${String(returnConfig.autoReturnEnabled)}`,
    );

    if (!returnConfig.successUrlIsHttps) {
      this.logger.warn(
        `[mp:return-config] flow=cv_adaptation adaptationId=${adaptationId} frontendHost=${returnConfig.frontendHost} successUrlIsHttps=${String(returnConfig.successUrlIsHttps)} autoReturnEnabled=${String(returnConfig.autoReturnEnabled)}`,
      );
    }

    let result: PreferenceResponse;
    try {
      result = await preference.create({
        body: {
          items: [
            {
              id: adaptationId,
              title: "CV Adaptado — EarlyCV",
              quantity: 1,
              unit_price: priceInReais,
              currency_id: "BRL",
              ...itemMetadata,
            },
          ],
          external_reference: paymentReference,
          notification_url: notificationUrl,
          back_urls: returnConfig.backUrls,
          ...(returnConfig.autoReturn
            ? { auto_return: returnConfig.autoReturn }
            : {}),
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Mercado Pago preference error: ${message}`);
      throw new BadRequestException(`Mercado Pago error: ${message}`);
    }

    const checkoutUrl = isProduction
      ? (result.init_point ?? result.sandbox_init_point)
      : (result.sandbox_init_point ?? result.init_point);
    if (!checkoutUrl) {
      throw new BadRequestException(
        "Mercado Pago did not return a checkout URL.",
      );
    }

    return {
      paymentReference,
      checkoutUrl,
      amountInCents: requireEnvInt("PRICE_PLAN_STARTER"),
      currency: "BRL",
      mpPreferenceId: result.id ? String(result.id) : null,
    };
  }

  async resolveWebhookPayment(
    provider: string,
    body: unknown,
  ): Promise<WebhookPaymentResolution> {
    if (provider === "mercadopago") {
      return this.resolveMercadoPagoPayment(body);
    }

    throw new BadRequestException(`Payment provider ${provider} not supported`);
  }

  async checkPaymentApprovedByReference(
    paymentReference: string,
  ): Promise<boolean> {
    const client = this.getMercadoPagoClient();
    const paymentClient = new Payment(client);

    const results = await paymentClient.search({
      options: { external_reference: paymentReference },
    });

    const approved = results.results?.some((p) => p.status === "approved");
    return Boolean(approved);
  }

  private async resolveMercadoPagoPayment(
    body: unknown,
  ): Promise<WebhookPaymentResolution> {
    const empty: WebhookPaymentResolution = {
      paymentReference: null,
      status: "unknown",
      paymentId: null,
      merchantOrderId: null,
      preferenceId: null,
      rawStatus: null,
    };

    if (!body || typeof body !== "object") return empty;

    const data = body as Record<string, unknown>;

    // MP sends { type: "payment", data: { id: "<payment_id>" } }
    if (data.type !== "payment") {
      this.logger.log(`Ignoring MP webhook type: ${String(data.type)}`);
      return empty;
    }

    const paymentIdRaw =
      typeof data.data === "object" && data.data !== null
        ? (data.data as Record<string, unknown>).id
        : null;
    const paymentId =
      typeof paymentIdRaw === "string"
        ? paymentIdRaw.trim()
        : typeof paymentIdRaw === "number"
          ? String(paymentIdRaw)
          : null;

    if (!paymentId) return empty;

    const client = this.getMercadoPagoClient();
    const paymentClient = new Payment(client);
    const payment = await paymentClient.get({ id: paymentId });

    const mp = payment as unknown as {
      preference_id?: string;
      order?: { id?: number };
    };

    const paymentReference = payment.external_reference ?? null;
    const preferenceId = mp.preference_id ?? null;
    const merchantOrderId = mp.order?.id != null ? String(mp.order.id) : null;
    const rawStatus = payment.status ?? null;

    if (payment.status === "approved") {
      return {
        paymentReference,
        status: "approved",
        paymentId,
        merchantOrderId,
        preferenceId,
        rawStatus,
      };
    }

    if (
      payment.status === "cancelled" ||
      payment.status === "charged_back" ||
      payment.status === "rejected" ||
      payment.status === "refunded"
    ) {
      return {
        paymentReference,
        status: "failed",
        paymentId,
        merchantOrderId,
        preferenceId,
        rawStatus,
      };
    }

    return {
      paymentReference,
      status: "pending",
      paymentId,
      merchantOrderId,
      preferenceId,
      rawStatus,
    };
  }
}

function requireEnvInt(...names: string[]): number {
  for (const name of names) {
    const raw = process.env[name];
    if (raw) {
      const value = parseInt(raw, 10);
      if (isNaN(value)) {
        throw new Error(`Env var ${name} must be a valid integer, got: "${raw}"`);
      }
      return value;
    }
  }
  throw new Error(`Required env var(s) [${names.join(", ")}] are not set`);
}
