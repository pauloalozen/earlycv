import { Inject, Injectable, Logger } from "@nestjs/common";
import type {
  EmailCategory,
  EmailMessage,
  EmailSendResult,
  EmailService as EmailServiceContract,
} from "./email.types";
import { DefaultEmailRoutingPolicy } from "./email-routing.policy";

// Fachada única de envio — responsabilidades: receber categoria+mensagem,
// resolver a rota (provider + senderProfile + tags) via a policy, montar
// a mensagem final, delegar o envio, devolver resultado padronizado,
// logar. NÃO persiste nada (sem tabela EmailLog genérica nesta entrega) —
// cada domínio chamador continua responsável pela própria persistência
// (Monitor grava em MonitorDigest/MonitorDigestEvent, pagamento em
// PaymentRecoveryEmail — fora do escopo desta entrega, autenticação não
// registra envio, como hoje).
//
// Deliberadamente SEM NENHUM `if` de categoria ou de provider aqui — quem
// decide "esta categoria usa SES, com este remetente" é
// DefaultEmailRoutingPolicy.resolve (ver email-routing.policy.ts); esta
// classe só aplica o que a rota devolveu. O chamador (ex.:
// MonitorDigestEmailService) nunca seta from/replyTo/configurationSet,
// só suas próprias tags de correlação (correlationType/correlationId).
@Injectable()
export class DefaultEmailService implements EmailServiceContract {
  private readonly logger = new Logger(DefaultEmailService.name);

  constructor(
    @Inject(DefaultEmailRoutingPolicy)
    private readonly policy: DefaultEmailRoutingPolicy,
  ) {}

  async send(params: {
    category: EmailCategory;
    message: EmailMessage;
  }): Promise<EmailSendResult> {
    const route = this.policy.resolve(params.category);

    const message: EmailMessage = route.senderProfile
      ? {
          ...params.message,
          from: {
            email: route.senderProfile.fromEmail,
            name: route.senderProfile.fromName,
          },
          replyTo: route.senderProfile.replyTo,
          configurationSet: route.senderProfile.configurationSet,
          tags: { ...params.message.tags, ...route.tags },
        }
      : params.message;

    const result = await route.provider.send(message);

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
}
