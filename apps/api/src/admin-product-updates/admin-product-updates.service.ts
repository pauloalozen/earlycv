import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { ProductUpdateAudience } from "@prisma/client";

import { DatabaseService } from "../database/database.service";
import { ProductUpdateSubscriptionService } from "../product-updates/product-update-subscription.service";
import { ProductUpdateTemplateService } from "../product-updates/product-update-template.service";
import {
  type CreateProductUpdateInput,
  ProductUpdatesService,
  type UpdateProductUpdateInput,
} from "../product-updates/product-updates.service";

const DEFAULT_PAGE_SIZE = 20;

// Camada fina de leitura/paginação pro admin — toda escrita/transição de
// estado é delegada a ProductUpdatesService (nunca reimplementada aqui,
// mesmo padrão do AdminMonitorService em relação aos services do Monitor).
@Injectable()
export class AdminProductUpdatesService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(ProductUpdatesService)
    private readonly productUpdatesService: ProductUpdatesService,
    @Inject(ProductUpdateTemplateService)
    private readonly templateService: ProductUpdateTemplateService,
    @Inject(ProductUpdateSubscriptionService)
    private readonly subscriptionService: ProductUpdateSubscriptionService,
  ) {}

  async list(pagination: { page?: number; limit?: number }) {
    const page = pagination.page ?? 1;
    const limit = pagination.limit ?? DEFAULT_PAGE_SIZE;

    const [items, total] = await Promise.all([
      this.database.productUpdate.findMany({
        orderBy: [{ createdAt: "desc" }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.database.productUpdate.count(),
    ]);

    return { items, total, page, limit };
  }

  async getDetail(id: string) {
    const productUpdate = await this.database.productUpdate.findUnique({
      where: { id },
    });
    if (!productUpdate) {
      throw new NotFoundException("product update not found");
    }
    return { productUpdate, stats: await this.computeStats(id) };
  }

  async create(input: CreateProductUpdateInput) {
    return this.productUpdatesService.create(input);
  }

  async update(id: string, patch: UpdateProductUpdateInput) {
    return this.productUpdatesService.updateContent(id, patch);
  }

  // viewport é só informativo pro front decidir a largura do container de
  // preview — o HTML/texto renderizado é sempre o mesmo (responsivo por
  // construção, ver ProductUpdateTemplateService), nunca duas versões
  // diferentes de marcação.
  async preview(
    id: string,
    options: { withName?: boolean },
  ): Promise<{ html: string; text: string }> {
    const productUpdate = await this.database.productUpdate.findUnique({
      where: { id },
    });
    if (!productUpdate) {
      throw new NotFoundException("product update not found");
    }

    return this.templateService.render(
      {
        subject: productUpdate.subject,
        preheader: productUpdate.preheader,
        content: productUpdate.content,
        primaryButtonText: productUpdate.primaryButtonText,
        primaryButtonUrl: productUpdate.primaryButtonUrl,
        optionalFooterContent: productUpdate.optionalFooterContent,
      },
      {
        recipientName: options.withName ? "Ana Exemplo" : null,
        mode: "test",
      },
    );
  }

  async sendTest(id: string, recipientEmail: string, adminId: string) {
    return this.productUpdatesService.sendTest(id, recipientEmail, adminId);
  }

  async markReady(id: string) {
    return this.productUpdatesService.markReady(id);
  }

  async eligibleCount(audience: ProductUpdateAudience) {
    return this.subscriptionService.countEligibleRecipients(audience);
  }

  async start(
    id: string,
    input: {
      audience: ProductUpdateAudience;
      confirmedRecipientCount: number;
      startedBy: string;
    },
  ) {
    return this.productUpdatesService.start(id, input);
  }

  async cancel(id: string, cancelledBy: string) {
    return this.productUpdatesService.cancel(id, cancelledBy);
  }

  async listDeliveries(
    id: string,
    pagination: { page?: number; limit?: number },
  ) {
    const page = pagination.page ?? 1;
    const limit = pagination.limit ?? DEFAULT_PAGE_SIZE;

    const [items, total] = await Promise.all([
      this.database.productUpdateDelivery.findMany({
        where: { productUpdateId: id },
        orderBy: [{ createdAt: "asc" }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.database.productUpdateDelivery.count({
        where: { productUpdateId: id },
      }),
    ]);

    return { items, total, page, limit };
  }

  // Exige os dois identificadores simultaneamente (productUpdateId +
  // deliveryId) — nunca só o deliveryId. Sem isso, o :id da rota era
  // decorativo: qualquer deliveryId existente respondia independente da
  // campanha na URL (IDOR entre campanha e delivery).
  async deliveryTimeline(productUpdateId: string, deliveryId: string) {
    const delivery = await this.database.productUpdateDelivery.findFirst({
      where: { id: deliveryId, productUpdateId },
    });
    if (!delivery) {
      throw new NotFoundException("delivery not found");
    }

    const events = await this.database.productUpdateEvent.findMany({
      where: { deliveryId },
      orderBy: [{ occurredAt: "asc" }],
    });

    return { delivery, events };
  }

  async stats(id: string) {
    await this.getExistingOrThrow(id);
    return this.computeStats(id);
  }

  private async getExistingOrThrow(id: string) {
    const productUpdate = await this.database.productUpdate.findUnique({
      where: { id },
    });
    if (!productUpdate) {
      throw new NotFoundException("product update not found");
    }
    return productUpdate;
  }

  // Aberturas/cliques ÚNICOS por entrega (nunca por evento bruto) — conta
  // ProductUpdateDelivery distintas com pelo menos um evento do tipo,
  // nunca a soma de eventos (um clique duplo não deveria contar 2x).
  private async computeStats(productUpdateId: string) {
    const [
      sent,
      failed,
      outcomeUnknown,
      cancelled,
      pending,
      processing,
      openedDeliveryIds,
      clickedDeliveryIds,
      bounced,
      complained,
      unsubscribed,
    ] = await Promise.all([
      this.database.productUpdateDelivery.count({
        where: { productUpdateId, status: "SENT" },
      }),
      this.database.productUpdateDelivery.count({
        where: { productUpdateId, status: "FAILED" },
      }),
      this.database.productUpdateDelivery.count({
        where: { productUpdateId, status: "OUTCOME_UNKNOWN" },
      }),
      this.database.productUpdateDelivery.count({
        where: { productUpdateId, status: "CANCELLED" },
      }),
      this.database.productUpdateDelivery.count({
        where: { productUpdateId, status: "PENDING" },
      }),
      this.database.productUpdateDelivery.count({
        where: { productUpdateId, status: "PROCESSING" },
      }),
      this.database.productUpdateEvent.findMany({
        where: { type: "OPENED", delivery: { productUpdateId } },
        distinct: ["deliveryId"],
        select: { deliveryId: true },
      }),
      this.database.productUpdateEvent.findMany({
        where: { type: "CLICKED", delivery: { productUpdateId } },
        distinct: ["deliveryId"],
        select: { deliveryId: true },
      }),
      this.database.productUpdateEvent.count({
        where: { type: "BOUNCED", delivery: { productUpdateId } },
      }),
      this.database.productUpdateEvent.count({
        where: { type: "COMPLAINED", delivery: { productUpdateId } },
      }),
      // Status ATUAL de opt-out entre os destinatários desta campanha —
      // o evento SUBSCRIPTION do SES é por TÓPICO, não por campanha
      // (ver ProductUpdateWebhookService.processSubscriptionEvent), então
      // não há como saber "descadastrou por causa deste e-mail
      // específico". Isto conta quantos dos destinatários já enviados
      // estão descadastrados agora, o mais próximo que dá pra mostrar
      // sem inventar uma correlação que os dados não sustentam.
      this.database.productUpdateDelivery.count({
        where: {
          productUpdateId,
          user: {
            productEmailSubscription: {
              subscribed: false,
              suppressionReason: "SES_OPT_OUT",
            },
          },
        },
      }),
    ]);

    return {
      sent,
      failed,
      outcomeUnknown,
      cancelled,
      pending,
      processing,
      uniqueOpened: openedDeliveryIds.length,
      uniqueClicked: clickedDeliveryIds.length,
      bounced,
      complained,
      unsubscribed,
    };
  }
}
