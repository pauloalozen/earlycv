import { Inject, Injectable } from "@nestjs/common";

import { DatabaseService } from "../database/database.service";
import { EmailSuppressionService } from "../email/email-suppression.service";
import { EmailDispatchConfigService } from "./email-dispatch.config";

export type EligibleUser = { id: string; email: string; name: string };

export type EligibilityResult =
  | { eligible: true; user: EligibleUser }
  // Sempre DESCARTE (o worker fecha em SKIPPED) — nenhuma destas condições
  // melhora sozinha. Adiamentos (janela de horário, boas-vindas recente)
  // não são elegibilidade e vivem no worker.
  | { eligible: false; reason: string };

// Reavaliada A CADA envio (não só no enqueue): o usuário pode ter se
// descadastrado, dado complaint ou virado staff entre o agendamento e o
// momento do envio.
@Injectable()
export class EmailDispatchEligibilityService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(EmailDispatchConfigService)
    private readonly config: EmailDispatchConfigService,
    @Inject(EmailSuppressionService)
    private readonly suppression: Pick<EmailSuppressionService, "findByEmail">,
  ) {}

  async evaluate(dispatch: {
    userId: string | null;
  }): Promise<EligibilityResult> {
    if (!dispatch.userId) {
      return { eligible: false, reason: "no_user" };
    }

    const user = await this.database.user.findUnique({
      where: { id: dispatch.userId },
      select: {
        id: true,
        email: true,
        name: true,
        status: true,
        emailVerifiedAt: true,
        createdAt: true,
        isStaff: true,
        internalRole: true,
        relationshipEmailPreference: { select: { subscribed: true } },
        // Complaint registrado nos fluxos legados vale para todas as
        // categorias. Bounce legado NÃO é lido de propósito: aqueles
        // handlers marcam BOUNCED inclusive em bounce transitório, então
        // não dá para saber se foi duro (ver EmailSuppression).
        monitorAlertPreference: { select: { suppressionReason: true } },
        productEmailSubscription: { select: { suppressionReason: true } },
      },
    });

    if (!user) return { eligible: false, reason: "user_not_found" };
    if (user.status !== "active") {
      return { eligible: false, reason: "user_inactive" };
    }
    if (!user.emailVerifiedAt) {
      return { eligible: false, reason: "email_unverified" };
    }
    if (user.isStaff || user.internalRole !== "none") {
      return { eligible: false, reason: "staff_user" };
    }
    if (await this.config.isBlocked(user.email)) {
      return { eligible: false, reason: "blocklisted" };
    }

    const startAt = await this.config.getStartAt();
    if (!startAt || user.createdAt < startAt) {
      return { eligible: false, reason: "before_cutoff" };
    }

    if (user.relationshipEmailPreference?.subscribed === false) {
      return { eligible: false, reason: "relationship_unsubscribed" };
    }

    if (
      user.monitorAlertPreference?.suppressionReason === "COMPLAINED" ||
      user.productEmailSubscription?.suppressionReason === "COMPLAINED"
    ) {
      return { eligible: false, reason: "suppressed_complaint" };
    }

    const suppressed = await this.suppression.findByEmail(user.email);
    if (suppressed) {
      return {
        eligible: false,
        reason:
          suppressed.reason === "COMPLAINT"
            ? "suppressed_complaint"
            : "suppressed_hard_bounce",
      };
    }

    return {
      eligible: true,
      user: { id: user.id, email: user.email, name: user.name },
    };
  }

  // Confirmação de compra (transacional, BILLING). Regras DIFERENTES das de
  // relacionamento, de propósito: é um recibo do que a pessoa acabou de
  // fazer, então NÃO depende de e-mail verificado, de descadastro de tópico,
  // da blocklist de relacionamento nem de staff. Continua barrando:
  //  - compra inexistente / de outro usuário / não mais "completed"
  //    (estornada entre a aprovação e o envio -> não confirma);
  //  - compra anterior ao cutoff (nunca e-mail de compra antiga);
  //  - endereço com hard bounce/complaint (não há como entregar/respeitar).
  async evaluatePurchaseConfirmation(dispatch: {
    userId: string | null;
    referenceId: string | null;
  }): Promise<EligibilityResult> {
    if (!dispatch.userId) return { eligible: false, reason: "no_user" };
    if (!dispatch.referenceId) {
      return { eligible: false, reason: "no_reference" };
    }

    const purchase = await this.database.planPurchase.findUnique({
      where: { id: dispatch.referenceId },
      select: { userId: true, status: true, createdAt: true },
    });
    if (!purchase) return { eligible: false, reason: "purchase_not_found" };
    if (purchase.userId !== dispatch.userId) {
      return { eligible: false, reason: "purchase_user_mismatch" };
    }
    if (purchase.status !== "completed") {
      return { eligible: false, reason: "purchase_not_completed" };
    }

    const startAt = await this.config.getStartAt();
    if (!startAt || purchase.createdAt < startAt) {
      return { eligible: false, reason: "before_cutoff" };
    }

    const user = await this.database.user.findUnique({
      where: { id: dispatch.userId },
      select: { id: true, email: true, name: true },
    });
    if (!user) return { eligible: false, reason: "user_not_found" };

    const suppressed = await this.suppression.findByEmail(user.email);
    if (suppressed) {
      return {
        eligible: false,
        reason:
          suppressed.reason === "COMPLAINT"
            ? "suppressed_complaint"
            : "suppressed_hard_bounce",
      };
    }

    return { eligible: true, user };
  }
}
