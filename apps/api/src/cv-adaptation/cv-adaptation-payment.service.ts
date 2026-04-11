import { randomUUID } from "node:crypto";

import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import MercadoPagoConfig, { Payment, Preference } from "mercadopago";
import type { PreferenceResponse } from "mercadopago/dist/clients/preference/commonTypes";

export type PaymentIntent = {
  paymentReference: string;
  checkoutUrl: string;
  amountInCents: number;
  currency: string;
};

@Injectable()
export class CvAdaptationPaymentService {
  private readonly logger = new Logger(CvAdaptationPaymentService.name);
  private readonly priceInCents: number;
  private readonly provider: string;

  constructor() {
    this.priceInCents = parseInt(
      process.env.PRICE_PLAN_STARTER || "1190",
      10,
    );
    this.provider = process.env.PAYMENT_PROVIDER || "mercadopago";
  }

  async createIntent(
    adaptationId: string,
    _userId: string,
  ): Promise<PaymentIntent> {
    if (this.provider === "mercadopago") {
      return this.createMercadoPagoIntent(adaptationId);
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
  ): Promise<PaymentIntent> {
    const client = this.getMercadoPagoClient();
    const preference = new Preference(client);

    const paymentReference = randomUUID();
    const priceInReais = this.priceInCents / 100;

    const frontendUrl = process.env.FRONTEND_URL ?? "http://localhost:3000";
    const apiUrl =
      process.env.API_URL ??
      process.env.NEXT_PUBLIC_API_URL ??
      "http://localhost:4000";
    const notificationUrl = `${apiUrl}/api/cv-adaptation/webhook/mercadopago`;

    const isProduction = this.isMpProduction();
    const successUrl = `${frontendUrl}/adaptar/${adaptationId}/confirmacao`;

    // auto_return only works with HTTPS back_urls
    const useAutoReturn = successUrl.startsWith("https://");

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
            },
          ],
          external_reference: paymentReference,
          notification_url: notificationUrl,
          back_urls: {
            success: successUrl,
            failure: `${frontendUrl}/adaptar/${adaptationId}/confirmacao`,
            pending: `${frontendUrl}/adaptar/${adaptationId}/confirmacao`,
          },
          ...(useAutoReturn && { auto_return: "approved" }),
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
      amountInCents: this.priceInCents,
      currency: "BRL",
    };
  }

  async resolvePaymentReference(
    provider: string,
    body: unknown,
  ): Promise<string | null> {
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
  ): Promise<string | null> {
    if (!body || typeof body !== "object") return null;

    const data = body as Record<string, unknown>;

    // MP sends { type: "payment", data: { id: "<payment_id>" } }
    if (data.type !== "payment") {
      this.logger.log(`Ignoring MP webhook type: ${String(data.type)}`);
      return null;
    }

    const paymentId =
      typeof data.data === "object" && data.data !== null
        ? String((data.data as Record<string, unknown>).id)
        : null;

    if (!paymentId) return null;

    const token = process.env.MERCADOPAGO_ACCESS_TOKEN;
    if (!token) {
      throw new BadRequestException("MERCADOPAGO_ACCESS_TOKEN not configured.");
    }

    const client = this.getMercadoPagoClient();
    const paymentClient = new Payment(client);
    const payment = await paymentClient.get({ id: paymentId });

    if (payment.status !== "approved") {
      this.logger.log(`Payment ${paymentId} not approved: ${payment.status}`);
      return null;
    }

    const externalReference = payment.external_reference;
    if (!externalReference) {
      this.logger.warn(`Payment ${paymentId} has no external_reference`);
      return null;
    }

    return externalReference;
  }
}
