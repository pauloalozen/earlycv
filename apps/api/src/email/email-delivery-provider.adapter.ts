import { Inject, Injectable } from "@nestjs/common";
import type {
  EmailMessage,
  EmailProvider,
  EmailProviderName,
  EmailSendResult,
} from "./email.types";
import {
  EMAIL_DELIVERY_PORT,
  type EmailDeliveryPort,
} from "./email-delivery.port";

// Adapta o EMAIL_DELIVERY_PORT existente (Resend real, ou
// FakeEmailDeliveryService em dev/test — a escolha já feita em
// EmailModule) para o contrato EmailProvider da fachada multi-provider.
// Escolha deliberada: NÃO reescrever ResendEmailDeliveryService/
// FakeEmailDeliveryService (preservados como estão, com sua suíte de
// testes intacta) — este adaptador só traduz o resultado.
//
// EmailMessage é estruturalmente compatível com EmailDeliveryMessage (todo
// campo extra de EmailMessage, como `tags`, é opcional e ignorado por
// quem não o declara) — nenhuma conversão de campo é necessária.
//
// Distinção FAILED vs OUTCOME_UNKNOWN: ResendEmailDeliveryService só lança
// depois de RECEBER uma resposta HTTP não-ok do Resend (erro confirmado —
// mensagem no formato "Failed to send email via Resend: <status>").
// Qualquer outra exceção (fetch rejeitando por timeout/rede antes de
// qualquer resposta) é ambígua por definição — não sabemos se o Resend
// chegou a processar o envio — e vira OUTCOME_UNKNOWN, nunca FAILED.
const CONFIRMED_REJECTION_PATTERN = /^Failed to send email via Resend: \d+$/;

@Injectable()
export class EmailDeliveryProviderAdapter implements EmailProvider {
  // EMAIL_DELIVERY_PORT hoje só cobre a integração Resend (real ou fake) —
  // não existe uma segunda variante coberta por este token.
  readonly name: EmailProviderName = "RESEND";

  constructor(
    @Inject(EMAIL_DELIVERY_PORT)
    private readonly delivery: EmailDeliveryPort,
  ) {}

  async send(message: EmailMessage): Promise<EmailSendResult> {
    try {
      const result = await this.delivery.send(message);
      return {
        outcome: "SENT",
        provider: this.name,
        providerMessageId: result.providerMessageId,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "unknown error";

      if (
        error instanceof Error &&
        CONFIRMED_REJECTION_PATTERN.test(error.message)
      ) {
        return {
          outcome: "FAILED",
          provider: this.name,
          providerMessageId: null,
          errorMessage,
        };
      }

      return {
        outcome: "OUTCOME_UNKNOWN",
        provider: this.name,
        providerMessageId: null,
        errorMessage,
      };
    }
  }
}
