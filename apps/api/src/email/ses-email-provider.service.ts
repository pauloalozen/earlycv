import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";
import { Inject, Injectable, Logger } from "@nestjs/common";
import type {
  EmailMessage,
  EmailProvider,
  EmailProviderName,
  EmailSendResult,
} from "./email.types";
import { EmailConfigService } from "./email-config.service";

// Provider SES v2 — usado hoje só pela categoria JOB_ALERT (digest do
// Monitor). Cliente construído sob demanda a cada send() (não no
// constructor) porque getSesConfig() pode lançar se SES_EMAIL_ENABLED=true
// mas a config estiver incompleta — isolar essa falha ao envio em si,
// nunca ao boot do módulo.
//
// Distinção FAILED vs OUTCOME_UNKNOWN: um erro com `$metadata.httpStatusCode`
// numérico veio de uma resposta de verdade da AWS (rejeição confirmada,
// mesmo que 5xx do lado deles) — sabemos com certeza que este envio
// específico não foi aceito. Ausência de httpStatusCode (exceção de rede,
// timeout, DNS, conexão resetada ANTES de qualquer resposta) é ambíguo por
// definição: a AWS pode ter recebido e processado o request sem a resposta
// chegar até nós. Nunca tratar o segundo caso como FAILED (evita retry
// automático de algo que pode já ter sido enviado).
@Injectable()
export class SesEmailProviderService implements EmailProvider {
  private readonly logger = new Logger(SesEmailProviderService.name);
  readonly name: EmailProviderName = "SES";

  constructor(
    @Inject(EmailConfigService)
    private readonly config: Pick<EmailConfigService, "getSesConfig">,
  ) {}

  async send(message: EmailMessage): Promise<EmailSendResult> {
    const sesConfig = this.config.getSesConfig();
    const client = new SESv2Client({
      region: sesConfig.region,
      credentials: {
        accessKeyId: sesConfig.accessKeyId,
        secretAccessKey: sesConfig.secretAccessKey,
      },
    });

    const headers = message.headers
      ? Object.entries(message.headers).map(([Name, Value]) => ({
          Name,
          Value,
        }))
      : undefined;
    const emailTags = message.tags
      ? Object.entries(message.tags).map(([Name, Value]) => ({ Name, Value }))
      : undefined;

    try {
      const result = await client.send(
        new SendEmailCommand({
          FromEmailAddress: `"${sesConfig.fromName}" <${sesConfig.fromEmail}>`,
          Destination: { ToAddresses: [message.to] },
          ConfigurationSetName: sesConfig.configurationSetName,
          EmailTags: emailTags,
          Content: {
            Simple: {
              Subject: { Data: message.subject, Charset: "UTF-8" },
              Body: {
                Text: { Data: message.text, Charset: "UTF-8" },
                ...(message.html
                  ? { Html: { Data: message.html, Charset: "UTF-8" } }
                  : {}),
              },
              Headers: headers,
            },
          },
        }),
      );

      return {
        outcome: "SENT",
        provider: this.name,
        providerMessageId: result.MessageId ?? null,
      };
    } catch (error) {
      return this.toSendResult(error);
    } finally {
      client.destroy();
    }
  }

  private toSendResult(error: unknown): EmailSendResult {
    const errorMessage =
      error instanceof Error ? error.message : "unknown error";
    const httpStatusCode = extractHttpStatusCode(error);

    if (httpStatusCode !== undefined) {
      this.logger.error("SES email delivery rejected", {
        provider: "ses",
        operation: "email_send",
        status: "failure",
        httpStatusCode,
        errorCode: extractErrorName(error),
      });
      return {
        outcome: "FAILED",
        provider: this.name,
        providerMessageId: null,
        errorCode: extractErrorName(error),
        errorMessage,
      };
    }

    this.logger.warn("SES email delivery outcome unknown (network/timeout)", {
      provider: "ses",
      operation: "email_send",
      status: "unknown",
      errorMessage,
    });
    return {
      outcome: "OUTCOME_UNKNOWN",
      provider: this.name,
      providerMessageId: null,
      errorMessage,
    };
  }
}

function extractHttpStatusCode(error: unknown): number | undefined {
  if (
    error &&
    typeof error === "object" &&
    "$metadata" in error &&
    error.$metadata &&
    typeof error.$metadata === "object" &&
    "httpStatusCode" in error.$metadata
  ) {
    const code = (error.$metadata as { httpStatusCode?: unknown })
      .httpStatusCode;
    return typeof code === "number" ? code : undefined;
  }
  return undefined;
}

function extractErrorName(error: unknown): string | undefined {
  if (error && typeof error === "object" && "name" in error) {
    const name = (error as { name?: unknown }).name;
    return typeof name === "string" ? name : undefined;
  }
  return undefined;
}
