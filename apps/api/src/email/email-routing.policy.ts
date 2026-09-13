import { Inject, Injectable } from "@nestjs/common";
import type {
  EmailCategory,
  EmailProvider,
  EmailRoutingPolicy,
  ResolvedEmailRoute,
} from "./email.types";
import { EmailConfigService } from "./email-config.service";
import { EmailDeliveryProviderAdapter } from "./email-delivery-provider.adapter";
import { SesEmailProviderService } from "./ses-email-provider.service";

// Mapa fixo por categoria — nunca comparação de assunto/template/string, e
// nunca mais mexido ao adicionar uma categoria de envio em massa nova
// (PRODUCT_ANNOUNCEMENT/MARKETING/ADMIN_COMMUNICATION já estão aqui,
// mapeadas pro destino final esperado, mesmo sem nenhum call site usá-las
// ainda — isso é só taxonomia, não libera envio nenhum: continuam sem
// seleção de destinatários/consentimento/fluxo próprio implementados).
//
// Toda categoria de envio em massa (SES) passa pela mesma checagem
// isSesEnabled(): por decisão explícita (sem fallback automático entre
// providers), se SES estiver desligado este método FALHA em vez de
// silenciosamente rotear pro Resend — o Resend não tem capacidade pro
// volume de envio em massa, usá-lo aqui esconderia o problema de limite
// diário que motivou esta migração. Quem decide "não enviar agora" por
// modo/coorte é o chamador (ex.: MonitorDigestEmailService, que só chama
// este roteador com JOB_ALERT quando o modo já exige SES) — nunca este
// roteador.
const RESEND_CATEGORIES = new Set<EmailCategory>(["AUTHENTICATION", "BILLING"]);

// É esta classe (não a fachada) que resolve a cadeia inteira EmailCategory
// -> provider -> senderProfile -> tags: DefaultEmailService só orquestra o
// resultado (merge no EmailMessage + chamar provider.send), sem saber que
// "SES" existe. senderProfile/tags só aparecem pra categorias de envio em
// massa (Resend usa seu próprio remetente fixo, fora do escopo desta
// entrega). Adicionar uma categoria nova (ex.: MARKETING) é só um novo
// case em EmailConfigService.getSesSenderProfile — esta classe nunca muda.
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
    private readonly config: Pick<
      EmailConfigService,
      "isSesEnabled" | "getSesSenderProfile"
    >,
  ) {}

  resolve(category: EmailCategory): ResolvedEmailRoute {
    if (RESEND_CATEGORIES.has(category)) {
      return { provider: this.resendAdapter };
    }

    // JOB_ALERT | PRODUCT_ANNOUNCEMENT | MARKETING | ADMIN_COMMUNICATION —
    // todo o resto do enum é envio em massa, sempre SES quando habilitado.
    if (!this.config.isSesEnabled()) {
      throw new Error(
        `${category} requer SES_EMAIL_ENABLED=true — sem fallback automático para Resend por decisão de produto`,
      );
    }

    const senderProfile = this.config.getSesSenderProfile(category);
    return {
      provider: this.sesProvider,
      senderProfile,
      tags: { category },
    };
  }
}
