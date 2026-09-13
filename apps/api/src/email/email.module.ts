import { Module } from "@nestjs/common";
import { DefaultEmailService } from "./email.service";
import { EMAIL_SERVICE } from "./email.types";
import { EmailConfigService } from "./email-config.service";
import { EMAIL_DELIVERY_PORT } from "./email-delivery.port";
import { EmailDeliveryProviderAdapter } from "./email-delivery-provider.adapter";
import { DefaultEmailRoutingPolicy } from "./email-routing.policy";
import { FakeEmailDeliveryService } from "./fake-email-delivery.service";
import { ResendEmailDeliveryService } from "./resend-email-delivery.service";
import { SesEmailProviderService } from "./ses-email-provider.service";

// Fonte única de envio de e-mail transacional do backend — antes vivia só
// dentro de AuthModule (verificação de e-mail/reset de senha). Extraído
// pra cá pra ser reaproveitado pelo Monitor (digest) sem criar uma
// terceira implementação direta do Resend (payment-recovery, que já tinha
// a própria implementação antes desta extração, não foi migrada nesta
// fase — fora do escopo do Monitor e é código crítico de pagamento).
const useResend =
  Boolean(process.env.RESEND_API_KEY) && process.env.APP_ENV === "production";

// EMAIL_DELIVERY_PORT continua existindo tal como antes (Resend real ou
// FakeEmailDeliveryService) — é a integração que EmailDeliveryProviderAdapter
// expõe como o provider "RESEND" da fachada multi-provider (ver
// EmailRoutingPolicy). Nenhuma categoria hoje usa SesEmailProviderService
// além de JOB_ALERT, e só quando SES_EMAIL_ENABLED=true.
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
    EmailConfigService,
    EmailDeliveryProviderAdapter,
    SesEmailProviderService,
    DefaultEmailRoutingPolicy,
    DefaultEmailService,
    { provide: EMAIL_SERVICE, useExisting: DefaultEmailService },
  ],
  exports: [FakeEmailDeliveryService, EMAIL_DELIVERY_PORT, EMAIL_SERVICE],
})
export class EmailModule {}
