import { Inject, Injectable, Logger } from "@nestjs/common";
import type {
  EmailCategory,
  EmailMessage,
  EmailSendResult,
  EmailService as EmailServiceContract,
} from "./email.types";
import { EmailConfigService } from "./email-config.service";
import { DefaultEmailRoutingPolicy } from "./email-routing.policy";

// Fachada única de envio — responsabilidades: receber categoria+mensagem,
// resolver o provider via a policy, delegar o envio, devolver resultado
// padronizado, logar. NÃO persiste nada (sem tabela EmailLog genérica
// nesta entrega) — cada domínio chamador continua responsável pela própria
// persistência (Monitor grava em MonitorDigest/MonitorDigestEvent,
// pagamento em PaymentRecoveryEmail — fora do escopo desta entrega,
// autenticação não registra envio, como hoje).
//
// Único lugar que sabe "categoria → identidade de remetente": quando o
// provider resolvido é SES, busca o SesSenderProfile da categoria
// (EmailConfigService.getSesSenderProfile) e injeta from/replyTo/
// configurationSet + a tag `category` na mensagem ANTES de chamar o
// provider — o chamador (ex.: MonitorDigestEmailService) nunca seta esses
// campos, só suas próprias tags de correlação (correlationType/
// correlationId). SesEmailProviderService nunca faz essa resolução
// sozinho; é assim que uma categoria nova nunca exige tocar o provider.
@Injectable()
export class DefaultEmailService implements EmailServiceContract {
  private readonly logger = new Logger(DefaultEmailService.name);

  constructor(
    @Inject(DefaultEmailRoutingPolicy)
    private readonly policy: DefaultEmailRoutingPolicy,
    @Inject(EmailConfigService)
    private readonly config: Pick<EmailConfigService, "getSesSenderProfile">,
  ) {}

  async send(params: {
    category: EmailCategory;
    message: EmailMessage;
  }): Promise<EmailSendResult> {
    const provider = this.policy.resolve(params.category);

    const message: EmailMessage =
      provider.name === "SES"
        ? this.withSesSenderProfile(params.category, params.message)
        : params.message;

    const result = await provider.send(message);

    const logPayload = {
      category: params.category,
      provider: result.provider,
      outcome: result.outcome,
      providerMessageId: result.providerMessageId,
    };

    if (result.outcome === "SENT") {
      this.logger.log("email_send", logPayload);
    } else {
      this.logger.warn("email_send", {
        ...logPayload,
        errorCode: result.errorCode,
        errorMessage: result.errorMessage,
      });
    }

    return result;
  }

  private withSesSenderProfile(
    category: EmailCategory,
    message: EmailMessage,
  ): EmailMessage {
    const profile = this.config.getSesSenderProfile(category);
    return {
      ...message,
      from: { email: profile.fromEmail, name: profile.fromName },
      replyTo: profile.replyTo,
      configurationSet: profile.configurationSetName,
      tags: { ...message.tags, category },
    };
  }
}
