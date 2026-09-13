import { Inject, Injectable } from "@nestjs/common";

import { APP_ENV, type AppEnv } from "../config/env.module";

export type SesConfig = {
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  configurationSetName: string;
  fromEmail: string;
  fromName: string;
};

// Config tipada do SES — lida do AppEnv (validado no boot pelo EnvModule),
// nunca de process.env direto. Os campos AWS_SES_* são opcionais no schema
// do AppEnv porque só fazem sentido quando SES_EMAIL_ENABLED=true; exigir
// isso no boot da API inteira derrubaria produção sem digest algum
// configurado ainda. A checagem "obrigatório quando ligado" acontece aqui,
// sob demanda, isolada ao módulo de e-mail (ver SesEmailProviderService,
// que chama getSesConfig() só quando de fato precisa enviar).
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
  getSesConfig(): SesConfig {
    const required: Partial<SesConfig> = {
      region: this.env.AWS_SES_REGION,
      accessKeyId: this.env.AWS_SES_ACCESS_KEY_ID,
      secretAccessKey: this.env.AWS_SES_SECRET_ACCESS_KEY,
      configurationSetName: this.env.AWS_SES_CONFIGURATION_SET,
      fromEmail: this.env.AWS_SES_FROM_EMAIL,
      fromName: this.env.AWS_SES_FROM_NAME,
    };

    const missingKeys = (
      Object.keys(required) as Array<keyof SesConfig>
    ).filter((key) => !required[key]);

    if (missingKeys.length > 0) {
      throw new Error(
        `SES_EMAIL_ENABLED=true mas configuração obrigatória ausente: ${missingKeys.join(", ")}`,
      );
    }

    return required as SesConfig;
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
}
