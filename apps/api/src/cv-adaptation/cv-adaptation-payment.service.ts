import { randomUUID } from "node:crypto";

import { BadRequestException, Injectable } from "@nestjs/common";
import type { ConfigService } from "@nestjs/config";

export type PaymentIntent = {
  paymentReference: string;
  checkoutUrl: string;
  amountInCents: number;
  currency: string;
};

@Injectable()
export class CvAdaptationPaymentService {
  private readonly priceInCents: number;
  private readonly currency: string;
  private readonly provider: string;

  constructor(private readonly config: ConfigService) {
    this.priceInCents = this.config.get<number>(
      "CV_ADAPTATION_PRICE_IN_CENTS",
      2990,
    );
    this.currency = this.config.get<string>("CV_ADAPTATION_CURRENCY", "BRL");
    this.provider = this.config.get<string>("PAYMENT_PROVIDER", "mercadopago");
  }

  async createIntent(
    adaptationId: string,
    _userId: string,
  ): Promise<PaymentIntent> {
    if (this.provider === "mercadopago") {
      return this.createMercadoPagoIntent(adaptationId);
    }

    if (this.provider === "stripe") {
      return this.createStripeIntent(adaptationId);
    }

    throw new BadRequestException(
      `Payment provider ${this.provider} not supported`,
    );
  }

  private async createMercadoPagoIntent(
    adaptationId: string,
  ): Promise<PaymentIntent> {
    const token = this.config.get<string>("MERCADOPAGO_ACCESS_TOKEN");
    if (!token) {
      throw new BadRequestException(
        "Mercado Pago is not configured. Set MERCADOPAGO_ACCESS_TOKEN.",
      );
    }

    const paymentReference = randomUUID();

    // For MVP: create a mock preference URL
    // In production, this would call Mercado Pago API
    const mockCheckoutUrl = `https://sandbox.mercadopago.com/checkout/v1/${adaptationId}`;

    return {
      paymentReference,
      checkoutUrl: mockCheckoutUrl,
      amountInCents: this.priceInCents,
      currency: this.currency,
    };
  }

  private async createStripeIntent(
    adaptationId: string,
  ): Promise<PaymentIntent> {
    const token = this.config.get<string>("STRIPE_SECRET_KEY");
    if (!token) {
      throw new BadRequestException(
        "Stripe is not configured. Set STRIPE_SECRET_KEY.",
      );
    }

    const paymentReference = randomUUID();

    // For MVP: create a mock payment intent
    // In production, this would call Stripe API
    const mockCheckoutUrl = `https://checkout.stripe.com/${adaptationId}`;

    return {
      paymentReference,
      checkoutUrl: mockCheckoutUrl,
      amountInCents: this.priceInCents,
      currency: this.currency,
    };
  }

  verifyMercadoPagoWebhook(
    _rawBody: Buffer,
    _headers: Record<string, string>,
  ): boolean {
    // For MVP: accept all Mercado Pago webhooks
    // In production, verify HMAC signature
    return true;
  }

  verifyStripeWebhook(_rawBody: Buffer, _signature: string): boolean {
    // For MVP: accept all Stripe webhooks
    // In production, verify signature using webhook secret
    return true;
  }

  resolveMercadoPagoPaymentReference(body: unknown): string {
    // Extract payment reference from Mercado Pago webhook body
    if (!body || typeof body !== "object") {
      throw new BadRequestException("Invalid Mercado Pago webhook body");
    }

    const data = body as Record<string, unknown>;

    // Mercado Pago sends payment reference in idempotency_key or external_reference
    if (typeof data.data === "object" && data.data !== null) {
      const innerData = data.data as Record<string, unknown>;
      if (typeof innerData.external_reference === "string") {
        return innerData.external_reference;
      }
      if (typeof innerData.id === "string") {
        return String(innerData.id);
      }
    }

    throw new BadRequestException(
      "Could not find payment reference in Mercado Pago webhook",
    );
  }

  resolveStripePaymentReference(body: unknown): string {
    // Extract payment reference from Stripe webhook body
    if (!body || typeof body !== "object") {
      throw new BadRequestException("Invalid Stripe webhook body");
    }

    const data = body as Record<string, unknown>;

    // Stripe sends payment intent ID in data.object.id
    if (typeof data.data === "object" && data.data !== null) {
      const innerData = data.data as Record<string, unknown>;
      if (typeof innerData.object === "object" && innerData.object !== null) {
        const obj = innerData.object as Record<string, unknown>;
        if (typeof obj.id === "string") {
          return obj.id;
        }
        if (typeof obj.client_secret === "string") {
          return obj.client_secret;
        }
      }
    }

    throw new BadRequestException(
      "Could not find payment reference in Stripe webhook",
    );
  }

  async resolvePaymentReference(
    provider: string,
    body: unknown,
  ): Promise<string> {
    if (provider === "mercadopago") {
      return this.resolveMercadoPagoPaymentReference(body);
    }

    if (provider === "stripe") {
      return this.resolveStripePaymentReference(body);
    }

    throw new BadRequestException(`Payment provider ${provider} not supported`);
  }
}
