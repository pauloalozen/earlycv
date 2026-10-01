import { Inject, Injectable } from "@nestjs/common";
import type { EmailDispatchKind } from "@prisma/client";

import { APP_ENV, type AppEnv } from "../config/env.module";
import { EmailConfigService } from "../email/email-config.service";
import { RELATIONSHIP_BLOCKED_EMAILS } from "./email-dispatch.constants";
import {
  type EmailDispatchModeValue,
  EmailDispatchSettingsService,
  type SettingsSnapshot,
} from "./email-dispatch-settings.service";

// OFF       nada é criado nem enviado.
// SHADOW    cria a linha e avalia tudo (elegibilidade, variante, template),
//           mas NUNCA envia — fecha em SKIPPED "shadow_mode". Serve para
//           medir volume/elegibilidade em produção sem disparar.
// ALLOWLIST só envia para a allowlist configurada no admin (resto: SKIPPED).
// LIVE      envia para todo elegível criado a partir do cutoff.
// Modos, cutoff e listas vêm do BANCO (EmailDispatchSettings, aba Emails →
// Configurações), não de variável de ambiente.
export type RelationshipMode = EmailDispatchModeValue;

export type SendReadiness =
  | { ready: true; contactListName: string; topicName: string }
  | { ready: false; reason: string };

type EmailDispatchEnv = Pick<
  AppEnv,
  | "AWS_SES_CONFIGURATION_SET"
  | "AWS_SES_CONTACT_LIST_NAME"
  | "AWS_SES_PRODUCT_UPDATE_TOPIC_NAME"
  | "AWS_SES_RELATIONSHIP_CONFIGURATION_SET"
  | "AWS_SES_RELATIONSHIP_TOPIC_NAME"
>;

@Injectable()
export class EmailDispatchConfigService {
  constructor(
    @Inject(APP_ENV) private readonly env: EmailDispatchEnv,
    @Inject(EmailConfigService)
    private readonly emailConfig: Pick<
      EmailConfigService,
      "isSesEnabled" | "getSesSenderProfile" | "getSesClientConfig"
    >,
    @Inject(EmailDispatchSettingsService)
    private readonly settings: Pick<
      EmailDispatchSettingsService,
      "getSnapshot"
    >,
  ) {}

  private snapshot(): Promise<SettingsSnapshot> {
    return this.settings.getSnapshot();
  }

  // Cutoff de novos cadastros/compras (admin → Configurações). Ausente = nenhum
  // fluxo roda.
  async getStartAt(): Promise<Date | null> {
    return (await this.snapshot()).startAt;
  }

  // protected: testes sobrescrevem sem mexer em process.env global.
  protected isProduction(): boolean {
    return process.env.APP_ENV === "production";
  }

  // Transporte REAL só em produção. Fora dela o dispatch usa transporte
  // fake em QUALQUER modo (inclusive ALLOWLIST): nada sai pela rede. A única
  // exceção é um teste explícito (EmailDispatchService.sendTest com
  // realTransport:true, destinatário informado, nunca varre a base).
  isRealTransportAllowed(): boolean {
    return this.isProduction();
  }

  private modeOf(
    settings: SettingsSnapshot,
    kind: EmailDispatchKind,
  ): EmailDispatchModeValue {
    if (kind === "WELCOME") return settings.welcomeMode;
    if (kind === "FEEDBACK_FIRST_USE") return settings.feedbackMode;
    if (kind === "FEEDBACK_SECOND_CALL") return settings.feedbackSecondCallMode;
    if (kind === "MOCK_INTERVIEW_OFFER") return settings.mockInterviewOfferMode;
    return settings.purchaseConfirmationMode;
  }

  // Modo EFETIVO. Sem cutoff = OFF. Fora de produção LIVE vira ALLOWLIST:
  // dev/homolog/teste nunca disparam para a base, no máximo para endereços
  // explicitamente listados (e, mesmo assim, com transporte fake).
  async getEffectiveMode(kind: EmailDispatchKind): Promise<RelationshipMode> {
    const settings = await this.snapshot();
    if (!settings.startAt) return "OFF";

    const configured = this.modeOf(settings, kind);
    if (configured === "LIVE" && !this.isProduction()) {
      return "ALLOWLIST";
    }
    return configured;
  }

  async getEnabledKinds(): Promise<EmailDispatchKind[]> {
    const enabled: EmailDispatchKind[] = [];
    for (const kind of [
      "WELCOME",
      "FEEDBACK_FIRST_USE",
      "FEEDBACK_SECOND_CALL",
      "PURCHASE_CONFIRMATION",
      "MOCK_INTERVIEW_OFFER",
    ] as const) {
      if ((await this.getEffectiveMode(kind)) !== "OFF") enabled.push(kind);
    }
    return enabled;
  }

  async isBlocked(email: string): Promise<boolean> {
    const normalized = email.trim().toLowerCase();
    return (
      RELATIONSHIP_BLOCKED_EMAILS.includes(normalized) ||
      (await this.snapshot()).extraBlocklist.includes(normalized)
    );
  }

  async isAllowlisted(email: string): Promise<boolean> {
    return (await this.snapshot()).allowlist.includes(
      email.trim().toLowerCase(),
    );
  }

  // Confirmação de compra sai pelo Resend (BILLING): em transporte real exige
  // a chave configurada — sem ela o módulo de e-mail cairia no transporte
  // fake em silêncio e a linha viraria "SENT" sem ter saído.
  checkPurchaseSendReadiness():
    | { ready: true }
    | { ready: false; reason: string } {
    return process.env.RESEND_API_KEY
      ? { ready: true }
      : { ready: false, reason: "resend_not_configured" };
  }

  // Tudo que um envio REAL de relacionamento exige. Qualquer item faltando
  // = não envia (linhas ficam PENDING até expirar), nunca cai em fallback:
  //  - SES ligado;
  //  - lista de contatos + tópico de relacionamento;
  //  - tópico de relacionamento DIFERENTE do de Product Updates (senão
  //    descadastrar de um descadastraria do outro);
  //  - perfil de remetente completo com Configuration Set PRÓPRIO e
  //    diferente do compartilhado (que faz tracking de abertura/clique).
  checkSendReadiness(): SendReadiness {
    if (!this.emailConfig.isSesEnabled()) {
      return { ready: false, reason: "ses_disabled" };
    }

    const contactListName = this.env.AWS_SES_CONTACT_LIST_NAME;
    const topicName = this.env.AWS_SES_RELATIONSHIP_TOPIC_NAME;
    if (!contactListName || !topicName) {
      return { ready: false, reason: "list_management_not_configured" };
    }

    if (topicName === this.env.AWS_SES_PRODUCT_UPDATE_TOPIC_NAME) {
      return { ready: false, reason: "relationship_topic_equals_product" };
    }

    // Credenciais AWS completas: faltando, o provider lançaria ANTES de
    // qualquer chamada de rede, e o worker não pode confundir isso com um
    // envio ambíguo (OUTCOME_UNKNOWN).
    try {
      this.emailConfig.getSesClientConfig();
    } catch {
      return { ready: false, reason: "ses_credentials_incomplete" };
    }

    try {
      const profile = this.emailConfig.getSesSenderProfile("RELATIONSHIP");
      if (
        this.env.AWS_SES_CONFIGURATION_SET &&
        profile.configurationSet === this.env.AWS_SES_CONFIGURATION_SET
      ) {
        return {
          ready: false,
          reason: "relationship_config_set_is_shared_tracking_set",
        };
      }
    } catch {
      return { ready: false, reason: "sender_profile_incomplete" };
    }

    return { ready: true, contactListName, topicName };
  }
}
