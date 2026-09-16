import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import type { ProductUpdate, ProductUpdateAudience } from "@prisma/client";

import { BusinessFunnelEventService } from "../analysis-observability/business-funnel-event.service";
import { APP_ENV, type AppEnv } from "../config/env.module";
import { DatabaseService } from "../database/database.service";
import { ProductUpdateEmailService } from "./product-update-email.service";
import { ProductUpdateSubscriptionService } from "./product-update-subscription.service";
import { ProductUpdateTemplateService } from "./product-update-template.service";

export type CreateProductUpdateInput = {
  internalName: string;
  subject: string;
  preheader?: string;
  content: string;
  primaryButtonText?: string;
  primaryButtonUrl?: string;
  optionalFooterContent?: string;
  createdBy: string;
};

// Campos cuja edição invalida um teste já enviado (ver markReady) — sempre
// que qualquer um deles muda, testSentAt/testSentBy/testRecipientEmail são
// zerados e, se a campanha estava READY, ela volta pra DRAFT. Lista
// exaustiva de propósito (não "todo campo que não seja controle interno")
// pra nunca esquecer um campo de conteúdo novo sem decidir explicitamente
// se ele invalida o teste.
const CONTENT_FIELDS = [
  "subject",
  "preheader",
  "content",
  "primaryButtonText",
  "primaryButtonUrl",
  "optionalFooterContent",
] as const;
export type UpdateProductUpdateInput = {
  subject?: string;
  content?: string;
  preheader?: string | null;
  primaryButtonText?: string | null;
  primaryButtonUrl?: string | null;
  optionalFooterContent?: string | null;
};

const EDITABLE_STATUSES = new Set(["DRAFT", "READY"]);

@Injectable()
export class ProductUpdatesService {
  private readonly logger = new Logger(ProductUpdatesService.name);

  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(APP_ENV)
    private readonly env: Pick<AppEnv, "PRODUCT_UPDATES_ENABLED">,
    @Inject(ProductUpdateEmailService)
    private readonly emailService: ProductUpdateEmailService,
    @Inject(ProductUpdateSubscriptionService)
    private readonly subscriptionService: ProductUpdateSubscriptionService,
    @Inject(ProductUpdateTemplateService)
    private readonly templateService: ProductUpdateTemplateService,
    @Inject(BusinessFunnelEventService)
    private readonly funnelEvents: BusinessFunnelEventService,
  ) {}

  // Eventos administrativos de Product Updates no PostHog — SEM PII: nunca
  // e-mail, nome, assunto, conteúdo ou lista de destinatários no metadata,
  // só ids/contadores/status. Falha ao gravar nunca derruba a ação
  // administrativa que a originou.
  private recordAdminEvent(
    eventName:
      | "product_update_created"
      | "product_update_test_sent"
      | "product_update_started"
      | "product_update_cancelled",
    productUpdateId: string,
    adminId: string,
    metadata: Record<string, unknown> = {},
  ) {
    this.funnelEvents
      .record(
        {
          eventName,
          eventVersion: 1,
          metadata: { productUpdateId, ...metadata },
        },
        {
          correlationId: `product-update:${productUpdateId}`,
          ip: null,
          requestId: `product-update:${productUpdateId}`,
          routePath: "/api/admin/product-updates",
          sessionInternalId: null,
          sessionPublicToken: null,
          userAgentHash: null,
          userId: adminId,
        },
        "backend",
      )
      .catch((err: unknown) => {
        this.logger.warn(`failed to record ${eventName}: ${err}`);
      });
  }

  private assertEnabled() {
    if (!this.env.PRODUCT_UPDATES_ENABLED) {
      throw new UnprocessableEntityException(
        "PRODUCT_UPDATES_ENABLED=false — nenhum envio de teste ou real é permitido enquanto a flag estiver desligada",
      );
    }
  }

  private async findOrThrow(id: string): Promise<ProductUpdate> {
    const productUpdate = await this.database.productUpdate.findUnique({
      where: { id },
    });
    if (!productUpdate) {
      throw new NotFoundException("product update not found");
    }
    return productUpdate;
  }

  async create(input: CreateProductUpdateInput): Promise<ProductUpdate> {
    const created = await this.database.productUpdate.create({
      data: {
        internalName: input.internalName,
        subject: input.subject,
        preheader: input.preheader,
        content: input.content,
        primaryButtonText: input.primaryButtonText,
        primaryButtonUrl: input.primaryButtonUrl,
        optionalFooterContent: input.optionalFooterContent,
        createdBy: input.createdBy,
      },
    });
    this.recordAdminEvent(
      "product_update_created",
      created.id,
      input.createdBy,
    );
    return created;
  }

  // Edição só é permitida em DRAFT/READY (nunca depois de start). Editar
  // qualquer CONTENT_FIELDS zera o teste (backend, não só UI — ver §3 do
  // plano) e reverte READY -> DRAFT.
  async updateContent(
    id: string,
    patch: UpdateProductUpdateInput,
  ): Promise<ProductUpdate> {
    const current = await this.findOrThrow(id);
    if (!EDITABLE_STATUSES.has(current.status)) {
      throw new UnprocessableEntityException(
        `campanha em status ${current.status} não pode mais ser editada`,
      );
    }

    const changedContent = CONTENT_FIELDS.some(
      (field) => field in patch && patch[field] !== current[field],
    );

    return this.database.productUpdate.update({
      where: { id },
      data: {
        ...patch,
        ...(changedContent
          ? {
              testSentAt: null,
              testSentBy: null,
              testRecipientEmail: null,
              status: current.status === "READY" ? "DRAFT" : current.status,
            }
          : {}),
      },
    });
  }

  async sendTest(
    id: string,
    recipientEmail: string,
    adminId: string,
  ): Promise<ProductUpdate> {
    this.assertEnabled();
    const current = await this.findOrThrow(id);
    if (!EDITABLE_STATUSES.has(current.status)) {
      throw new UnprocessableEntityException(
        `campanha em status ${current.status} não aceita envio de teste`,
      );
    }

    const result = await this.emailService.sendTest(id, recipientEmail);
    if (!result.sent) {
      throw new BadRequestException(
        `falha ao enviar teste: ${result.errorMessage}`,
      );
    }

    const updated = await this.database.productUpdate.update({
      where: { id },
      data: {
        testSentAt: new Date(),
        testSentBy: adminId,
        testRecipientEmail: recipientEmail,
      },
    });
    this.recordAdminEvent("product_update_test_sent", id, adminId);
    return updated;
  }

  // Trava de teste obrigatório NO BACKEND (não só UI) — recusa sem
  // testSentAt, mesmo que a UI de alguma forma permita o clique.
  async markReady(id: string): Promise<ProductUpdate> {
    const current = await this.findOrThrow(id);
    if (current.status !== "DRAFT") {
      throw new UnprocessableEntityException(
        `só é possível marcar como pronta a partir de DRAFT (status atual: ${current.status})`,
      );
    }
    if (!current.testSentAt) {
      throw new UnprocessableEntityException(
        "envie um teste antes de marcar a campanha como pronta",
      );
    }

    return this.database.productUpdate.update({
      where: { id },
      data: { status: "READY" },
    });
  }

  async countEligible(audience: ProductUpdateAudience): Promise<number> {
    return this.subscriptionService.countEligibleRecipients(audience);
  }

  // Recalcula elegibilidade na hora (nunca reaproveita uma contagem
  // antiga), congela htmlSnapshot/textSnapshot, cria uma
  // ProductUpdateDelivery por destinatário numa única transação.
  // confirmedRecipientCount precisa bater com o recálculo — protege contra
  // a UI mostrar um número desatualizado e o admin confirmar às cegas.
  async start(
    id: string,
    input: {
      audience: ProductUpdateAudience;
      confirmedRecipientCount: number;
      startedBy: string;
    },
  ): Promise<ProductUpdate> {
    this.assertEnabled();
    const current = await this.findOrThrow(id);
    if (current.status !== "READY") {
      throw new UnprocessableEntityException(
        `só é possível iniciar envio a partir de READY (status atual: ${current.status})`,
      );
    }

    const recipients = await this.subscriptionService.resolveEligibleRecipients(
      input.audience,
    );
    if (recipients.length !== input.confirmedRecipientCount) {
      throw new BadRequestException(
        `contagem de elegíveis mudou (confirmado=${input.confirmedRecipientCount}, atual=${recipients.length}) — recarregue e confirme de novo`,
      );
    }
    if (recipients.length === 0) {
      throw new UnprocessableEntityException(
        "nenhum destinatário elegível para o público selecionado",
      );
    }

    const { html, text } = this.templateService.render(
      {
        subject: current.subject,
        preheader: current.preheader,
        content: current.content,
        primaryButtonText: current.primaryButtonText,
        primaryButtonUrl: current.primaryButtonUrl,
        optionalFooterContent: current.optionalFooterContent,
      },
      { recipientName: null, mode: "real" },
    );

    try {
      const started = await this.database.$transaction(async (tx) => {
        const updated = await tx.productUpdate.update({
          where: { id },
          data: {
            status: "SENDING",
            audience: input.audience,
            recipientCount: recipients.length,
            startedBy: input.startedBy,
            startedAt: new Date(),
            htmlSnapshot: html,
            textSnapshot: text,
          },
        });

        await tx.productUpdateDelivery.createMany({
          data: recipients.map((recipient) => ({
            productUpdateId: id,
            userId: recipient.userId,
            recipientEmail: recipient.email,
            recipientName: recipient.name,
          })),
        });

        return updated;
      });
      this.recordAdminEvent("product_update_started", id, input.startedBy, {
        audience: input.audience,
        recipientCount: recipients.length,
      });
      return started;
    } catch (error) {
      await this.database.productUpdate.update({
        where: { id },
        data: { status: "FAILED", failedAt: new Date() },
      });
      throw error;
    }
  }

  // Só cancela entregas ainda PENDING — SENT/FAILED/PROCESSING/
  // OUTCOME_UNKNOWN não são tocadas (uma entrega em voo termina).
  async cancel(id: string, cancelledBy: string): Promise<ProductUpdate> {
    const current = await this.findOrThrow(id);
    if (current.status !== "SENDING") {
      throw new UnprocessableEntityException(
        `só é possível cancelar uma campanha em SENDING (status atual: ${current.status})`,
      );
    }

    const { cancelled, count } = await this.database.$transaction(
      async (tx) => {
        const { count } = await tx.productUpdateDelivery.updateMany({
          where: { productUpdateId: id, status: "PENDING" },
          data: { status: "CANCELLED" },
        });
        const cancelled = await tx.productUpdate.update({
          where: { id },
          data: { status: "CANCELLED", cancelledAt: new Date() },
        });
        return { cancelled, count };
      },
    );

    this.recordAdminEvent("product_update_cancelled", id, cancelledBy, {
      cancelledDeliveryCount: count,
    });
    return cancelled;
  }
}
