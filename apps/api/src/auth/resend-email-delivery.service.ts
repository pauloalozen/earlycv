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

    if (!res.ok) {
      const body = await res.text();
      this.logger.error(`Resend error ${res.status}: ${body}`);
      throw new Error(`Failed to send email via Resend: ${res.status}`);
    }
  }
}
