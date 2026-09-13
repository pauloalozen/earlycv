import { Inject, Injectable } from "@nestjs/common";
import type {
  EmailCategory,
  EmailProvider,
  EmailRoutingPolicy,
} from "./email.types";
import { EmailConfigService } from "./email-config.service";
import { EmailDeliveryProviderAdapter } from "./email-delivery-provider.adapter";
import { SesEmailProviderService } from "./ses-email-provider.service";

// Mapa fixo por categoria — nunca comparação de assunto/template/string.
// JOB_ALERT é a única categoria que pode ir para SES, e só quando
// SES_EMAIL_ENABLED=true: por decisão explícita (sem fallback automático
// entre providers), se JOB_ALERT for solicitado com SES desligado, este
// método FALHA em vez de silenciosamente rotear pro Resend — o Resend não
// tem capacidade pro volume de digest, então usá-lo aqui esconderia o
// problema de limite diário que motivou esta migração. Quem decide "não
// enviar agora" é o chamador (MonitorDigestWorker), verificando
// isSesEnabled()/coorte ANTES de chamar EmailService — nunca este roteador.
@Injectable()
export class DefaultEmailRoutingPolicy implements EmailRoutingPolicy {
  // Tipados pela interface EmailProvider (não pela classe concreta) — o
  // token de injeção (@Inject) continua sendo a classe real, mas o
  // contrato aqui é só o que EmailRoutingPolicy precisa. Isso também
  // permite testar esta classe com providers falsos simples (object
  // literal), sem instanciar EmailDeliveryProviderAdapter/
  // SesEmailProviderService de verdade (ver email-routing.policy.spec.ts).
  constructor(
    @Inject(EmailDeliveryProviderAdapter)
    private readonly resendAdapter: EmailProvider,
    @Inject(SesEmailProviderService)
    private readonly sesProvider: EmailProvider,
    @Inject(EmailConfigService)
    private readonly config: Pick<EmailConfigService, "isSesEnabled">,
  ) {}

  resolve(category: EmailCategory): EmailProvider {
    switch (category) {
      case "AUTHENTICATION":
      case "BILLING":
      case "ADMIN_COMMUNICATION":
        return this.resendAdapter;
      case "JOB_ALERT":
        if (!this.config.isSesEnabled()) {
          throw new Error(
            "JOB_ALERT requer SES_EMAIL_ENABLED=true — sem fallback automático para Resend por decisão de produto",
          );
        }
        return this.sesProvider;
      default: {
        const exhaustive: never = category;
        throw new Error(`unknown email category: ${exhaustive}`);
      }
    }
  }
}
