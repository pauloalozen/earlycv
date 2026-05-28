import { Injectable, Logger } from "@nestjs/common";

type Ga4PurchasePayload = {
  purchaseId: string;
  userId?: string | null;
  clientId?: string | null;
  value: number;
  currency: string;
  planId?: string | null;
  planName?: string | null;
  credits?: number | null;
  originAction?: string | null;
  paymentId?: string | null;
  paymentReference?: string | null;
};

type Ga4EventItem = {
  item_id?: string;
  item_name?: string;
  price?: number;
  quantity: number;
};

const GOOGLE_MP_COLLECT_URL = "https://www.google-analytics.com/mp/collect";
const GOOGLE_MP_DEBUG_URL = "https://www.google-analytics.com/debug/mp/collect";
const REQUEST_TIMEOUT_MS = 3000;

@Injectable()
export class Ga4MeasurementService {
  private readonly logger = new Logger(Ga4MeasurementService.name);

  isEnabled(): boolean {
    const enabled = process.env.GA4_ENABLED?.trim().toLowerCase();
    if (enabled !== "true") return false;
    return Boolean(this.getMeasurementId() && this.getApiSecret());
  }

  async sendPurchaseEvent(payload: Ga4PurchasePayload): Promise<void> {
    if (!this.isEnabled()) {
      return;
    }

    const measurementId = this.getMeasurementId();
    const apiSecret = this.getApiSecret();
    if (!measurementId || !apiSecret) {
      return;
    }

    const resolvedClientId =
      payload.clientId ?? buildFallbackClientId(payload.purchaseId, payload.userId);

    const endpoint = this.isDebugMode() ? GOOGLE_MP_DEBUG_URL : GOOGLE_MP_COLLECT_URL;
    const params = new URLSearchParams({
      measurement_id: measurementId,
      api_secret: apiSecret,
    });
    const url = `${endpoint}?${params.toString()}`;

    const item: Ga4EventItem = {
      quantity: 1,
      ...(payload.planId ? { item_id: payload.planId } : {}),
      ...(payload.planName ? { item_name: payload.planName } : {}),
      price: payload.value,
    };

    const eventParams = {
      transaction_id: payload.purchaseId,
      value: payload.value,
      currency: payload.currency,
      items: [item],
      ...(this.isDebugMode() ? { debug_mode: 1 } : {}),
      payment_provider: "mercado_pago",
      plan_name: payload.planName ?? undefined,
      credits: payload.credits ?? undefined,
      origin_action: payload.originAction ?? undefined,
      payment_id: payload.paymentId ?? undefined,
      payment_reference: payload.paymentReference ?? undefined,
    };

    const requestBody = {
      client_id: resolvedClientId,
      user_id: payload.userId ?? undefined,
      events: [
        {
          name: "purchase",
          params: eventParams,
        },
      ],
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      if (!payload.clientId) {
        this.logger.warn(
          `[ga4] purchase ${payload.purchaseId} missing client_id; using fallback client_id`,
        );
      }
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      if (!response.ok) {
        const details = await response.text().catch(() => "");
        this.logger.warn(
          `[ga4] purchase event rejected status=${response.status} body=${details.slice(0, 300)}`,
        );
        return;
      }

      if (this.isDebugMode()) {
        const details = await response.text().catch(() => "");
        if (details) {
          this.logger.log(`[ga4] debug response: ${details.slice(0, 400)}`);
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`[ga4] purchase event failed: ${message}`);
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  private isDebugMode(): boolean {
    return process.env.GA4_DEBUG_MODE?.trim().toLowerCase() === "true";
  }

  private getMeasurementId(): string | null {
    const value = process.env.GA4_MEASUREMENT_ID?.trim();
    return value && value.length > 0 ? value : null;
  }

  private getApiSecret(): string | null {
    const value = process.env.GA4_API_SECRET?.trim();
    return value && value.length > 0 ? value : null;
  }
}

function buildFallbackClientId(purchaseId: string, userId?: string | null): string {
  const seed = `${purchaseId}:${userId ?? ""}`;
  let hash = 0;

  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  }

  const left = String(hash || 1);
  const right = String(Date.now());
  return `${left}.${right}`;
}
