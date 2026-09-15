import { Inject, Injectable } from "@nestjs/common";

import { DatabaseService } from "../database/database.service";
import { EMAIL_SERVICE, type EmailService } from "../email/email.types";
import { ProductUpdateTemplateService } from "./product-update-template.service";

export type SendTestResult =
  | { sent: true }
  | { sent: false; errorMessage: string };

// Isolado do envio real (ver ProductUpdateSenderWorker, adicionado numa
// entrega posterior) — envio de teste nunca usa ListManagementOptions,
// nunca cria ProductUpdateDelivery, nunca entra nas métricas da campanha.
// Um único destinatário por chamada (decisão de produto).
@Injectable()
export class ProductUpdateEmailService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(EMAIL_SERVICE) private readonly emailService: EmailService,
    @Inject(ProductUpdateTemplateService)
    private readonly templateService: ProductUpdateTemplateService,
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
}
