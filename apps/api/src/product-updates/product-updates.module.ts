import { Module } from "@nestjs/common";

import { AnalysisObservabilityModule } from "../analysis-observability/analysis-observability.module";
import { DatabaseModule } from "../database/database.module";
import { EmailModule } from "../email/email.module";
import { IngestionLockRepository } from "../ingestion/ingestion-lock.repository";
import { ProductUpdateEmailService } from "./product-update-email.service";
import { ProductUpdateSenderWorker } from "./product-update-sender.worker";
import { ProductUpdateSubscriptionService } from "./product-update-subscription.service";
import { ProductUpdateTemplateService } from "./product-update-template.service";
import { ProductUpdateWebhookService } from "./product-update-webhook.service";
import { ProductUpdatesService } from "./product-updates.service";

@Module({
  imports: [DatabaseModule, EmailModule, AnalysisObservabilityModule],
  providers: [
    ProductUpdateSubscriptionService,
    ProductUpdateTemplateService,
    ProductUpdateEmailService,
    ProductUpdatesService,
    ProductUpdateWebhookService,
    // Reinstanciado aqui (não importado via IngestionModule inteiro) —
    // mesmo padrão do MonitorModule: só precisa de DatabaseService, é
    // barato redeclarar em vez de acoplar aos demais providers de
    // ingestão de vagas.
    IngestionLockRepository,
    ProductUpdateSenderWorker,
  ],
  exports: [
    ProductUpdateSubscriptionService,
    ProductUpdateTemplateService,
    ProductUpdateEmailService,
    ProductUpdatesService,
    // Exportado só pra fiação do webhook em MonitorPublicController (ver
    // comentário em monitor.module.ts) — única exceção documentada ao
    // isolamento total entre os dois domínios, motivada por não mover a
    // rota /api/monitor/webhooks/ses nesta entrega.
    ProductUpdateWebhookService,
  ],
})
export class ProductUpdatesModule {}
