import { Module } from "@nestjs/common";

import { EMAIL_DELIVERY_PORT } from "./email-delivery.port";
import { FakeEmailDeliveryService } from "./fake-email-delivery.service";
import { ResendEmailDeliveryService } from "./resend-email-delivery.service";

// Fonte única de envio de e-mail transacional do backend — antes vivia só
// dentro de AuthModule (verificação de e-mail/reset de senha). Extraído
// pra cá pra ser reaproveitado pelo Monitor (digest) sem criar uma
// terceira implementação direta do Resend (payment-recovery, que já tinha
// a própria implementação antes desta extração, não foi migrada nesta
// fase — fora do escopo do Monitor e é código crítico de pagamento).
const useResend =
  Boolean(process.env.RESEND_API_KEY) && process.env.APP_ENV === "production";

@Module({
  providers: [
    FakeEmailDeliveryService,
    ResendEmailDeliveryService,
    {
      provide: EMAIL_DELIVERY_PORT,
      useExisting: useResend
        ? ResendEmailDeliveryService
        : FakeEmailDeliveryService,
    },
  ],
  exports: [FakeEmailDeliveryService, EMAIL_DELIVERY_PORT],
})
export class EmailModule {}
