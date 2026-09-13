import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";
import { Inject, Injectable, Logger } from "@nestjs/common";
import type {
  EmailMessage,
  EmailProvider,
  EmailProviderName,
  EmailSendResult,
} from "./email.types";
import { EmailConfigService } from "./email-config.service";

// Provider SES v2 — genérico, sem saber de categoria/Monitor/digest.
// Cliente construído sob demanda a cada send() (não no constructor) porque
// getSesClientConfig() pode lançar se SES_EMAIL_ENABLED=true mas a config
// estiver incompleta — isolar essa falha ao envio em si, nunca ao boot do
// módulo.
//
// Identidade de remetente (from/replyTo/configurationSet) SEMPRE vem já
// resolvida em `message` pela fachada (DefaultEmailService, que consulta
// EmailConfigService.getSesSenderProfile(category) antes de chamar isto) —
// este provider nunca lê fromEmail/fromName/configurationSet de config
// algum. É isso que garante que adicionar uma categoria nova (ex.:
// MARKETING) nunca exige tocar este arquivo.
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
    private readonly config: Pick<EmailConfigService, "getSesClientConfig">,
  ) {}

  async send(message: EmailMessage): Promise<EmailSendResult> {
    if (!message.from || !message.configurationSet) {
      // Defensivo: só a fachada deveria chamar este provider, e ela sempre
      // resolve isto antes. Chegar aqui sem from/configurationSet é bug de
      // quem chamou, não um estado ambíguo de rede — falha confirmada, sem
      // sequer tentar a AWS.
      throw new Error(
        "SesEmailProviderService.send chamado sem from/configurationSet resolvidos — só a fachada (DefaultEmailService) deveria chamar este provider",
      );
    }

    const clientConfig = this.config.getSesClientConfig();
    const client = new SESv2Client({
      region: clientConfig.region,
      credentials: {
        accessKeyId: clientConfig.accessKeyId,
        secretAccessKey: clientConfig.secretAccessKey,
      },
    });

    const headers = [
      ...(message.headers
        ? Object.entries(message.headers).map(([Name, Value]) => ({
            Name,
            Value,
          }))
        : []),
      ...(message.replyTo
        ? [{ Name: "Reply-To", Value: message.replyTo }]
        : []),
    ];
    const emailTags = message.tags
      ? Object.entries(message.tags).map(([Name, Value]) => ({ Name, Value }))
      : undefined;

    try {
      const result = await client.send(
        new SendEmailCommand({
          FromEmailAddress: `"${message.from.name}" <${message.from.email}>`,
          Destination: { ToAddresses: [message.to] },
          ConfigurationSetName: message.configurationSet,
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
              Headers: headers.length > 0 ? headers : undefined,
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
