import { Inject, Injectable, Logger } from "@nestjs/common";
import type {
  EmailCategory,
  EmailMessage,
  EmailSendResult,
  EmailService as EmailServiceContract,
} from "./email.types";
import { DefaultEmailRoutingPolicy } from "./email-routing.policy";

// Fachada única de envio — responsabilidades: receber categoria+mensagem,
// resolver o provider via a policy, delegar o envio, devolver resultado
// padronizado, logar. NÃO persiste nada (sem tabela EmailLog genérica
// nesta entrega) — cada domínio chamador continua responsável pela própria
// persistência (Monitor grava em MonitorDigest/MonitorDigestEvent,
// pagamento em PaymentRecoveryEmail — fora do escopo desta entrega,
// autenticação não registra envio, como hoje).
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
    const provider = this.policy.resolve(params.category);
    const result = await provider.send(params.message);

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
