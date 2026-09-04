import { Injectable, Logger } from "@nestjs/common";

import type {
  EmailDeliveryMessage,
  EmailDeliveryPort,
  EmailDeliveryResult,
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

  async send(message: EmailDeliveryMessage): Promise<EmailDeliveryResult> {
    // `headers` (List-Unsubscribe etc.) vai no CORPO da requisição — é
    // assim que a API do Resend aplica cabeçalhos customizados na
    // mensagem em si. `Idempotency-Key` é diferente: é um HEADER HTTP da
    // própria chamada à API do Resend (mesmo padrão do Stripe), não do
    // e-mail — protege contra reenvio duplicado se a resposta desta
    // chamada se perder num timeout.
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        ...(message.idempotencyKey
          ? { "Idempotency-Key": message.idempotencyKey }
          : {}),
      },
      body: JSON.stringify({
        from: this.from,
        to: [message.to],
        subject: message.subject,
        text: message.text,
        ...(message.html ? { html: message.html } : {}),
        ...(message.headers ? { headers: message.headers } : {}),
      }),
    });

    if (!res.ok) {
      const requestId =
        res.headers.get("x-request-id") ??
        res.headers.get("x-correlation-id") ??
        undefined;
      this.logger.error("Resend email delivery failed", {
        provider: "resend",
        operation: "email_send",
        status: "failure",
        errorCode: `HTTP_${res.status}`,
        requestId,
      });
      throw new Error(`Failed to send email via Resend: ${res.status}`);
    }

    // Resend devolve { id: "..." } no corpo em caso de sucesso — é esse id
    // que os webhooks (data.email_id) usam pra referenciar esta mensagem.
    // Corpo malformado/sem id não é motivo de falhar o envio (já aconteceu
    // de verdade do lado do provider) — só perde a correlação.
    try {
      const body = (await res.json()) as { id?: unknown };
      return {
        providerMessageId: typeof body.id === "string" ? body.id : null,
      };
    } catch {
      return { providerMessageId: null };
    }
  }
}
