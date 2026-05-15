import { Injectable, Logger } from "@nestjs/common";

import type {
  EmailDeliveryMessage,
  EmailDeliveryPort,
} from "./email-delivery.port";

@Injectable()
export class ResendEmailDeliveryService implements EmailDeliveryPort {
  private readonly logger = new Logger(ResendEmailDeliveryService.name);
  private readonly apiKey: string;
  private readonly from: string;

  constructor() {
    this.apiKey = process.env.RESEND_API_KEY ?? "";
    this.from = process.env.EMAIL_FROM ?? "EarlyCV <noreply@earlycv.com.br>";
  }

  async send(message: EmailDeliveryMessage): Promise<void> {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: this.from,
        to: [message.to],
        subject: message.subject,
        text: message.text,
        ...(message.html ? { html: message.html } : {}),
      }),
    });

    const requestId =
      res.headers.get("x-request-id") ?? res.headers.get("x-correlation-id");

    if (!res.ok) {
      this.logger.error("Email delivery failed", {
        errorCode: `HTTP_${res.status}`,
        operation: "email_send",
        provider: "resend",
        requestId: requestId ?? undefined,
        status: "failure",
      });
      throw new Error(`Failed to send email via Resend: ${res.status}`);
    }

    const responseBody = await this.safeParseResponseBody(res);
    this.logger.log("Email delivery succeeded", {
      messageId: this.extractMessageId(responseBody),
      operation: "email_send",
      provider: "resend",
      requestId: requestId ?? undefined,
      status: "success",
    });
  }

  private extractMessageId(responseBody: unknown): string | undefined {
    if (!responseBody || typeof responseBody !== "object") {
      return undefined;
    }

    const candidate = (responseBody as { id?: unknown }).id;
    return typeof candidate === "string" && candidate.length > 0
      ? candidate
      : undefined;
  }

  private async safeParseResponseBody(res: Response): Promise<unknown> {
    try {
      return await res.json();
    } catch {
      return undefined;
    }
  }
}
