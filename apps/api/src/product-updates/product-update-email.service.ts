import { Inject, Injectable } from "@nestjs/common";

import { APP_ENV, type AppEnv } from "../config/env.module";
import { DatabaseService } from "../database/database.service";
import {
  EMAIL_SERVICE,
  type EmailSendOutcome,
  type EmailService,
} from "../email/email.types";
import { ProductUpdateTemplateService } from "./product-update-template.service";

export type SendTestResult =
  | { sent: true }
  | { sent: false; errorMessage: string };

export type SendDeliveryResult =
  | {
      sent: true;
      outcome: EmailSendOutcome;
      providerMessageId: string | null;
      errorMessage?: string;
    }
  | { sent: false; skippedReason: string };

// Envio de teste é isolado do envio real (sendToDelivery, abaixo) — nunca
// usa ListManagementOptions, nunca cria ProductUpdateDelivery, nunca entra
// nas métricas da campanha. Um único destinatário por chamada (decisão de
// produto).
@Injectable()
export class ProductUpdateEmailService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(EMAIL_SERVICE) private readonly emailService: EmailService,
    @Inject(ProductUpdateTemplateService)
    private readonly templateService: ProductUpdateTemplateService,
    @Inject(APP_ENV)
    private readonly env: Pick<
      AppEnv,
      "AWS_SES_CONTACT_LIST_NAME" | "AWS_SES_PRODUCT_UPDATE_TOPIC_NAME"
    >,
  ) {}

  async sendTest(
    productUpdateId: string,
    recipientEmail: string,
  ): Promise<SendTestResult> {
    const productUpdate = await this.database.productUpdate.findUnique({
      where: { id: productUpdateId },
    });
    if (!productUpdate) {
      return { sent: false, errorMessage: "product_update_not_found" };
    }

    // Nome real se o e-mail de teste bater com um usuário existente (ex.:
    // o próprio admin testando com a conta dele) — nunca obrigatório,
    // envio de teste continua funcionando pra qualquer endereço.
    const matchingUser = await this.database.user.findUnique({
      where: { email: recipientEmail },
      select: { name: true },
    });

    const { html, text } = this.templateService.render(
      {
        subject: productUpdate.subject,
        preheader: productUpdate.preheader,
        content: productUpdate.content,
        primaryButtonText: productUpdate.primaryButtonText,
        primaryButtonUrl: productUpdate.primaryButtonUrl,
        optionalFooterContent: productUpdate.optionalFooterContent,
      },
      { recipientName: matchingUser?.name ?? null, mode: "test" },
    );

    const testBanner =
      '<div style="background:#fff3cd;color:#664d03;padding:8px 12px;border-radius:8px;font-size:12px;margin-bottom:16px;text-align:center;">Este é um envio de TESTE — não reflete o público final ainda.</div>';

    const result = await this.emailService.send({
      category: "PRODUCT_ANNOUNCEMENT",
      message: {
        to: recipientEmail,
        subject: `[TESTE] ${productUpdate.subject}`,
        html: testBanner + html,
        text: `[ENVIO DE TESTE — não reflete o público final ainda]\n\n${text}`,
        // correlationType distinto de PRODUCT_UPDATE de propósito — o
        // dispatcher do webhook SES nunca tenta correlacionar isto com uma
        // ProductUpdateDelivery (não existe nenhuma pra um envio de
        // teste), ignora com segurança como qualquer correlationType
        // desconhecido.
        tags: {
          correlationType: "PRODUCT_UPDATE_TEST",
          correlationId: productUpdateId,
          campaignId: productUpdateId,
        },
      },
    });

    if (result.outcome !== "SENT") {
      return {
        sent: false,
        errorMessage: result.errorMessage ?? `outcome=${result.outcome}`,
      };
    }

    return { sent: true };
  }

  // Envio real de uma ProductUpdateDelivery — usa o htmlSnapshot/
  // textSnapshot já congelados no momento do start (nunca re-renderiza,
  // nunca personaliza por destinatário: o que foi testado é exatamente o
  // que é enviado). Sempre inclui ListManagementOptions — é a única
  // barreira de descadastro (nenhum token/endpoint nosso).
  async sendToDelivery(deliveryId: string): Promise<SendDeliveryResult> {
    const delivery = await this.database.productUpdateDelivery.findUnique({
      where: { id: deliveryId },
      include: { productUpdate: true },
    });
    if (!delivery) {
      return { sent: false, skippedReason: "delivery_not_found" };
    }

    const { productUpdate } = delivery;
    if (!productUpdate.htmlSnapshot || !productUpdate.textSnapshot) {
      // Nunca deveria acontecer (start() sempre congela os dois antes de
      // criar qualquer delivery) — defesa em profundidade.
      return { sent: false, skippedReason: "missing_snapshot" };
    }

    const contactListName = this.env.AWS_SES_CONTACT_LIST_NAME;
    const topicName = this.env.AWS_SES_PRODUCT_UPDATE_TOPIC_NAME;
    if (!contactListName || !topicName) {
      return {
        sent: false,
        skippedReason: "ses_list_management_not_configured",
      };
    }

    const result = await this.emailService.send({
      category: "PRODUCT_ANNOUNCEMENT",
      message: {
        to: delivery.recipientEmail,
        subject: productUpdate.subject,
        html: productUpdate.htmlSnapshot,
        text: productUpdate.textSnapshot,
        listManagementOptions: { contactListName, topicName },
        // Chave estável derivada só do deliveryId (cuid opaco, sem PII) —
        // SES v2 não tem equivalente nativo (ignora este campo), a
        // correlação de fato é pelas tags abaixo, iguais ao padrão do
        // Monitor (ver monitor-digest-email.service.ts).
        idempotencyKey: `product-update-delivery:${delivery.id}`,
        tags: {
          correlationType: "PRODUCT_UPDATE",
          correlationId: delivery.id,
          campaignId: productUpdate.id,
        },
      },
    });

    return {
      sent: true,
      outcome: result.outcome,
      providerMessageId: result.providerMessageId,
      errorMessage: result.errorMessage,
    };
  }
}
