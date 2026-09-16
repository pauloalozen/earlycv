import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvFile } from "node:process";

import { Global, Module } from "@nestjs/common";

export type EnvSource = Record<string, string | undefined>;

export type AppEnv = {
  API_HOST: string;
  API_PORT: number;
  JOBS_GHOST_MODE: boolean;
  LINKEDIN_CALLBACK_URL?: string;
  LINKEDIN_CLIENT_ID?: string;
  LINKEDIN_CLIENT_SECRET?: string;
  JWT_ACCESS_SECRET: string;
  JWT_ACCESS_TTL: number;
  JWT_REFRESH_SECRET: string;
  JWT_REFRESH_TTL: number;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  GOOGLE_CALLBACK_URL: string;
  // Amazon SES (digest do Monitor/JOB_ALERT) — todos opcionais no schema
  // porque só são exigidos quando SES_EMAIL_ENABLED=true; essa validação
  // condicional acontece em EmailConfigService.assertSesConfigured(), não
  // aqui, pra nunca derrubar o boot da API em ambiente sem SES configurado
  // (dev/test, ou produção antes do rollout). Nunca logar
  // AWS_SES_ACCESS_KEY_ID/AWS_SES_SECRET_ACCESS_KEY.
  SES_EMAIL_ENABLED: boolean;
  AWS_SES_REGION?: string;
  AWS_SES_ACCESS_KEY_ID?: string;
  AWS_SES_SECRET_ACCESS_KEY?: string;
  // Genérico de propósito — um único Configuration Set pra todo envio em
  // massa via SES (JOB_ALERT hoje; PRODUCT_ANNOUNCEMENT/MARKETING/
  // ADMIN_COMMUNICATION quando existirem), nunca nomeado por categoria.
  AWS_SES_CONFIGURATION_SET?: string;
  // Perfil de remetente POR CATEGORIA — só JOB_ALERT nesta entrega. Uma
  // categoria nova ganha suas próprias 3 variáveis (ex.:
  // AWS_SES_MARKETING_FROM_EMAIL), nunca reaproveita as de outra.
  AWS_SES_JOB_ALERT_FROM_EMAIL?: string;
  AWS_SES_JOB_ALERT_FROM_NAME?: string;
  AWS_SES_JOB_ALERT_REPLY_TO?: string;
  // Perfil de remetente de PRODUCT_ANNOUNCEMENT (Product Updates) — mesmo
  // raciocínio do JOB_ALERT acima: 3 variáveis próprias, nunca reaproveita
  // as de outra categoria.
  AWS_SES_PRODUCT_UPDATE_FROM_EMAIL?: string;
  AWS_SES_PRODUCT_UPDATE_FROM_NAME?: string;
  AWS_SES_PRODUCT_UPDATE_REPLY_TO?: string;
  AWS_SES_CUSTOM_MAIL_FROM_DOMAIN?: string;
  AWS_SES_SNS_TOPIC_ARN?: string;
  // Controle temporário do log de SubscriptionConfirmation do SNS — default
  // false NUNCA expõe o SubscribeURL (que carrega o token de confirmação)
  // em log comum. Ligar só durante a configuração inicial da
  // infraestrutura (ver MonitorPublicController.sesWebhook), desligar
  // depois de confirmar a assinatura.
  AWS_SES_SNS_LOG_SUBSCRIPTION_URL: boolean;
  // Gerenciamento de lista nativo do SES usado pelo Product Updates — ver
  // ProductUpdateEmailService (ListManagementOptions no SendEmailCommand).
  // Nunca usado pelo Monitor (que não passa ListManagementOptions).
  AWS_SES_CONTACT_LIST_NAME?: string;
  AWS_SES_PRODUCT_UPDATE_TOPIC_NAME?: string;
  // Gate mestre do domínio Product Updates — nasce false: nenhum deploy,
  // migration ou criação de rascunho pode disparar envio de teste/real
  // enquanto esta flag não for ligada manualmente (ver
  // ProductUpdatesService/ProductUpdateSenderWorker).
  PRODUCT_UPDATES_ENABLED: boolean;
  // Limite inicial conservador de envio em massa do Product Updates (ver
  // ProductUpdateSenderWorker) — nada a ver com o digest do Monitor.
  PRODUCT_UPDATE_SEND_RATE_PER_SECOND: number;
};

export const APP_ENV = Symbol("APP_ENV");

function getLocalEnvCandidates(cwd: string) {
  return [resolve(cwd, ".env"), resolve(cwd, "../../.env")];
}

export function loadLocalEnvFileIfPresent(cwd = process.cwd()) {
  for (const candidate of getLocalEnvCandidates(cwd)) {
    if (existsSync(candidate)) {
      loadEnvFile(candidate);

      return candidate;
    }
  }

  return null;
}

export async function loadAppEnv(source?: EnvSource): Promise<AppEnv> {
  const { defineEnv, envToBoolean, envToNumber } = await import(
    "@earlycv/config/env"
  );
  const readEnv = defineEnv({
    API_HOST: {
      default: "0.0.0.0",
    },
    API_PORT: {
      default: "4000",
      parse: (value: string, key: string) => envToNumber(value, key),
    },
    JOBS_GHOST_MODE: {
      default: "false",
      parse: (value: string) => envToBoolean(value),
    },
    JWT_ACCESS_SECRET: {},
    JWT_ACCESS_TTL: {
      default: "900",
      parse: (value: string, key: string) => envToNumber(value, key),
    },
    JWT_REFRESH_SECRET: {},
    JWT_REFRESH_TTL: {
      default: "2592000",
      parse: (value: string, key: string) => envToNumber(value, key),
    },
    GOOGLE_CLIENT_ID: {},
    GOOGLE_CLIENT_SECRET: {},
    GOOGLE_CALLBACK_URL: {},
    LINKEDIN_CLIENT_ID: { optional: true },
    LINKEDIN_CLIENT_SECRET: { optional: true },
    LINKEDIN_CALLBACK_URL: { optional: true },
    SES_EMAIL_ENABLED: {
      default: "false",
      parse: (value: string) => envToBoolean(value),
    },
    AWS_SES_REGION: { optional: true },
    AWS_SES_ACCESS_KEY_ID: { optional: true },
    AWS_SES_SECRET_ACCESS_KEY: { optional: true },
    AWS_SES_CONFIGURATION_SET: { optional: true },
    AWS_SES_JOB_ALERT_FROM_EMAIL: { optional: true },
    AWS_SES_JOB_ALERT_FROM_NAME: { optional: true },
    AWS_SES_JOB_ALERT_REPLY_TO: { optional: true },
    AWS_SES_PRODUCT_UPDATE_FROM_EMAIL: { optional: true },
    AWS_SES_PRODUCT_UPDATE_FROM_NAME: { optional: true },
    AWS_SES_PRODUCT_UPDATE_REPLY_TO: { optional: true },
    AWS_SES_CUSTOM_MAIL_FROM_DOMAIN: { optional: true },
    AWS_SES_SNS_TOPIC_ARN: { optional: true },
    AWS_SES_SNS_LOG_SUBSCRIPTION_URL: {
      default: "false",
      parse: (value: string) => envToBoolean(value),
    },
    AWS_SES_CONTACT_LIST_NAME: { optional: true },
    AWS_SES_PRODUCT_UPDATE_TOPIC_NAME: { optional: true },
    PRODUCT_UPDATES_ENABLED: {
      default: "false",
      parse: (value: string) => envToBoolean(value),
    },
    PRODUCT_UPDATE_SEND_RATE_PER_SECOND: {
      default: "5",
      parse: (value: string, key: string) => envToNumber(value, key),
    },
  });

  const env = readEnv(source);

  return {
    API_HOST: env.API_HOST as string,
    API_PORT: env.API_PORT,
    JOBS_GHOST_MODE: env.JOBS_GHOST_MODE,
    GOOGLE_CALLBACK_URL: env.GOOGLE_CALLBACK_URL as string,
    GOOGLE_CLIENT_ID: env.GOOGLE_CLIENT_ID as string,
    GOOGLE_CLIENT_SECRET: env.GOOGLE_CLIENT_SECRET as string,
    LINKEDIN_CALLBACK_URL: env.LINKEDIN_CALLBACK_URL as string | undefined,
    LINKEDIN_CLIENT_ID: env.LINKEDIN_CLIENT_ID as string | undefined,
    LINKEDIN_CLIENT_SECRET: env.LINKEDIN_CLIENT_SECRET as string | undefined,
    JWT_ACCESS_SECRET: env.JWT_ACCESS_SECRET as string,
    JWT_ACCESS_TTL: env.JWT_ACCESS_TTL,
    JWT_REFRESH_SECRET: env.JWT_REFRESH_SECRET as string,
    JWT_REFRESH_TTL: env.JWT_REFRESH_TTL,
    SES_EMAIL_ENABLED: env.SES_EMAIL_ENABLED,
    AWS_SES_REGION: env.AWS_SES_REGION as string | undefined,
    AWS_SES_ACCESS_KEY_ID: env.AWS_SES_ACCESS_KEY_ID as string | undefined,
    AWS_SES_SECRET_ACCESS_KEY: env.AWS_SES_SECRET_ACCESS_KEY as
      | string
      | undefined,
    AWS_SES_CONFIGURATION_SET: env.AWS_SES_CONFIGURATION_SET as
      | string
      | undefined,
    AWS_SES_JOB_ALERT_FROM_EMAIL: env.AWS_SES_JOB_ALERT_FROM_EMAIL as
      | string
      | undefined,
    AWS_SES_JOB_ALERT_FROM_NAME: env.AWS_SES_JOB_ALERT_FROM_NAME as
      | string
      | undefined,
    AWS_SES_JOB_ALERT_REPLY_TO: env.AWS_SES_JOB_ALERT_REPLY_TO as
      | string
      | undefined,
    AWS_SES_PRODUCT_UPDATE_FROM_EMAIL: env.AWS_SES_PRODUCT_UPDATE_FROM_EMAIL as
      | string
      | undefined,
    AWS_SES_PRODUCT_UPDATE_FROM_NAME: env.AWS_SES_PRODUCT_UPDATE_FROM_NAME as
      | string
      | undefined,
    AWS_SES_PRODUCT_UPDATE_REPLY_TO: env.AWS_SES_PRODUCT_UPDATE_REPLY_TO as
      | string
      | undefined,
    AWS_SES_CUSTOM_MAIL_FROM_DOMAIN: env.AWS_SES_CUSTOM_MAIL_FROM_DOMAIN as
      | string
      | undefined,
    AWS_SES_SNS_TOPIC_ARN: env.AWS_SES_SNS_TOPIC_ARN as string | undefined,
    AWS_SES_SNS_LOG_SUBSCRIPTION_URL: env.AWS_SES_SNS_LOG_SUBSCRIPTION_URL,
    AWS_SES_CONTACT_LIST_NAME: env.AWS_SES_CONTACT_LIST_NAME as
      | string
      | undefined,
    AWS_SES_PRODUCT_UPDATE_TOPIC_NAME: env.AWS_SES_PRODUCT_UPDATE_TOPIC_NAME as
      | string
      | undefined,
    PRODUCT_UPDATES_ENABLED: env.PRODUCT_UPDATES_ENABLED,
    PRODUCT_UPDATE_SEND_RATE_PER_SECOND: env.PRODUCT_UPDATE_SEND_RATE_PER_SECOND,
  };
}

@Global()
@Module({
  providers: [
    {
      provide: APP_ENV,
      useFactory: loadAppEnv,
    },
  ],
  exports: [APP_ENV],
})
export class EnvModule {}
