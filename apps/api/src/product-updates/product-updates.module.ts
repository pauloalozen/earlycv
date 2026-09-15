import { Module } from "@nestjs/common";

import { DatabaseModule } from "../database/database.module";
import { EmailModule } from "../email/email.module";
import { IngestionLockRepository } from "../ingestion/ingestion-lock.repository";
import { ProductUpdateEmailService } from "./product-update-email.service";
import { ProductUpdateSenderWorker } from "./product-update-sender.worker";
import { ProductUpdateSubscriptionService } from "./product-update-subscription.service";
import { ProductUpdateTemplateService } from "./product-update-template.service";
import { ProductUpdatesService } from "./product-updates.service";

@Module({
  imports: [DatabaseModule, EmailModule],
  providers: [
    ProductUpdateSubscriptionService,
    ProductUpdateTemplateService,
    ProductUpdateEmailService,
    ProductUpdatesService,
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
  ],
})
export class ProductUpdatesModule {}
