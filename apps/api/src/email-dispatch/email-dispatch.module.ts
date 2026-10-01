import { Module } from "@nestjs/common";

import { DatabaseModule } from "../database/database.module";
import { EmailModule } from "../email/email.module";
import { IngestionLockRepository } from "../ingestion/ingestion-lock.repository";
import { EmailDispatchConfigService } from "./email-dispatch.config";
import { EmailDispatchService } from "./email-dispatch.service";
import { EmailDispatchWorker } from "./email-dispatch.worker";
import { EmailDispatchEligibilityService } from "./email-dispatch-eligibility.service";
import { EmailDispatchWebhookService } from "./email-dispatch-webhook.service";

@Module({
  imports: [DatabaseModule, EmailModule],
  providers: [
    EmailDispatchConfigService,
    EmailDispatchEligibilityService,
    EmailDispatchService,
    EmailDispatchWebhookService,
    // Reinstanciado aqui (mesmo padrão de MonitorModule/ProductUpdatesModule).
    IngestionLockRepository,
    EmailDispatchWorker,
  ],
  exports: [
    // Modo/cutoff atuais — lidos pela recuperação de confirmações de compra.
    EmailDispatchConfigService,
    // AuthModule: ganchos pós-verificação.
    EmailDispatchService,
    // MonitorPublicController: roteamento do webhook SES (mesma exceção
    // documentada de ProductUpdateWebhookService).
    EmailDispatchWebhookService,
  ],
})
export class EmailDispatchModule {}
