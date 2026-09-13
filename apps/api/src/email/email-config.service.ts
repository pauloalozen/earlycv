import { Inject, Injectable } from "@nestjs/common";

import { APP_ENV, type AppEnv } from "../config/env.module";
import type { EmailCategory, EmailSenderProfile } from "./email.types";

// Config de transporte AWS — pura, sem nada de identidade de remetente.
// Compartilhada por QUALQUER categoria que resolva pra SES.
export type SesClientConfig = {
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
};

// Config tipada do SES — lida do AppEnv (validado no boot pelo EnvModule),
// nunca de process.env direto. Os campos AWS_SES_* são opcionais no schema
// do AppEnv porque só fazem sentido quando SES_EMAIL_ENABLED=true; exigir
// isso no boot da API inteira derrubaria produção sem digest algum
// configurado ainda. A checagem "obrigatório quando ligado" acontece aqui,
// sob demanda, isolada ao módulo de e-mail.
@Injectable()
export class EmailConfigService {
  constructor(@Inject(APP_ENV) private readonly env: AppEnv) {}

  isSesEnabled(): boolean {
    return this.env.SES_EMAIL_ENABLED;
  }

  // Lança um erro claro e isolado a este módulo — nunca deixa a API cair
  // no boot geral por falta de config SES (auth/pagamento continuam
  // funcionando mesmo com SES mal configurado). NUNCA logar accessKeyId
  // nem secretAccessKey, nem incluí-los na mensagem de erro.
  getSesClientConfig(): SesClientConfig {
    const required: Partial<SesClientConfig> = {
      region: this.env.AWS_SES_REGION,
      accessKeyId: this.env.AWS_SES_ACCESS_KEY_ID,
      secretAccessKey: this.env.AWS_SES_SECRET_ACCESS_KEY,
    };

    const missingKeys = (
      Object.keys(required) as Array<keyof SesClientConfig>
    ).filter((key) => !required[key]);

    if (missingKeys.length > 0) {
      throw new Error(
        `SES_EMAIL_ENABLED=true mas configuração obrigatória ausente: ${missingKeys.join(", ")}`,
      );
    }

    return required as SesClientConfig;
  }

  // Perfil de remetente por categoria — implementado só para JOB_ALERT
  // nesta entrega, de propósito: nenhuma outra categoria tem seleção de
  // destinatários/consentimento implementados ainda, então nenhuma outra
  // categoria deve conseguir enviar (mesmo que EmailRoutingPolicy resolva
  // SES pra ela). Adicionar PRODUCT_ANNOUNCEMENT/MARKETING no futuro é só
  // acrescentar um novo `case` aqui — SesEmailProviderService nunca muda.
  getSesSenderProfile(category: EmailCategory): EmailSenderProfile {
    if (category !== "JOB_ALERT") {
      throw new Error(
        `SES sender profile não configurado para a categoria "${category}" — nenhum call site deveria estar enviando por ela ainda`,
      );
    }

    const required: Partial<EmailSenderProfile> = {
      fromEmail: this.env.AWS_SES_JOB_ALERT_FROM_EMAIL,
      fromName: this.env.AWS_SES_JOB_ALERT_FROM_NAME,
      configurationSet: this.env.AWS_SES_CONFIGURATION_SET,
    };

    const missingKeys = (
      Object.keys(required) as Array<keyof EmailSenderProfile>
    ).filter((key) => !required[key]);

    if (missingKeys.length > 0) {
      throw new Error(
        `SES sender profile de JOB_ALERT incompleto: ${missingKeys.join(", ")}`,
      );
    }

    return {
      ...(required as Required<
        Pick<EmailSenderProfile, "fromEmail" | "fromName" | "configurationSet">
      >),
      replyTo: this.env.AWS_SES_JOB_ALERT_REPLY_TO,
    };
  }

  // Só para documentação/diagnóstico (ex.: exibir no admin, validar
  // presença antes de instruções de rollout). O SES SendEmailCommand NÃO
  // aplica MAIL FROM por mensagem — mudar este valor exige reconfigurar a
  // identidade de domínio no console SES e atualizar os registros DNS
  // (MX/TXT do domínio de MAIL FROM customizado); só trocar esta variável
  // NUNCA muda o MAIL FROM efetivo dos envios.
  getCustomMailFromDomain(): string | undefined {
    return this.env.AWS_SES_CUSTOM_MAIL_FROM_DOMAIN;
  }

  // Usado pelo verificador de webhook SNS para rejeitar mensagens
  // anunciando um TopicArn diferente do esperado — nunca confiar só na
  // assinatura ser válida (ver ses-webhook-verifier.ts).
  getExpectedSnsTopicArn(): string | undefined {
    return this.env.AWS_SES_SNS_TOPIC_ARN;
  }

  // Default false: NUNCA expõe o SubscribeURL (carrega o token de
  // confirmação da subscription) em log comum. Ligar temporariamente só
  // durante a configuração inicial da infra SNS, desligar depois de
  // confirmar a assinatura (ver MonitorPublicController.sesWebhook).
  isSnsSubscriptionUrlLoggingEnabled(): boolean {
    return this.env.AWS_SES_SNS_LOG_SUBSCRIPTION_URL;
  }
}
