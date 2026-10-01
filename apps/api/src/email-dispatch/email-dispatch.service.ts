import { randomUUID } from "node:crypto";
import { Inject, Injectable, Logger } from "@nestjs/common";
import type { EmailDispatchKind, Prisma } from "@prisma/client";

import { DatabaseService } from "../database/database.service";
import {
  EMAIL_SERVICE,
  type EmailSendResult,
  type EmailService,
} from "../email/email.types";
import { EmailSuppressionService } from "../email/email-suppression.service";
import { EmailDispatchConfigService } from "./email-dispatch.config";
import {
  FEEDBACK_EXPIRY_MS,
  HOUR_MS,
  WELCOME_DELAY_MS,
  WELCOME_EXPIRY_MS,
} from "./email-dispatch.constants";
import {
  buildBillingMessage,
  buildRelationshipMessage,
} from "./email-dispatch-message";
import { computeFeedbackScheduledFor } from "./email-dispatch-schedule.util";
import {
  type FeedbackVariant,
  type PurchaseConfirmationPayload,
  type RenderedEmail,
  renderFeedbackEmail,
  renderPurchaseConfirmationEmail,
  renderWelcomeEmail,
} from "./email-dispatch-templates";

function resolveAppUrl(): string {
  return (
    process.env.FRONTEND_URL ?? process.env.APP_URL ?? "https://earlycv.com.br"
  );
}

export function renderDispatchEmail(input: {
  kind: EmailDispatchKind;
  name: string | null | undefined;
  variant: FeedbackVariant | null;
  payload?: PurchaseConfirmationPayload | null;
}): RenderedEmail {
  if (input.kind === "WELCOME") {
    return renderWelcomeEmail({ name: input.name, appUrl: resolveAppUrl() });
  }
  if (input.kind === "PURCHASE_CONFIRMATION") {
    if (!input.payload) {
      throw new Error("PURCHASE_CONFIRMATION requires a payload snapshot");
    }
    return renderPurchaseConfirmationEmail({
      name: input.name,
      appUrl: resolveAppUrl(),
      payload: input.payload,
    });
  }
  return renderFeedbackEmail({
    name: input.name,
    variant: input.variant ?? "NEUTRAL",
  });
}

export type SendTestInput = {
  kind: EmailDispatchKind;
  to: string;
  name?: string | null;
  variant?: FeedbackVariant;
  // Obrigatório para PURCHASE_CONFIRMATION (valores de exemplo informados).
  payload?: PurchaseConfirmationPayload;
  // Transporte REAL só com esta opção explícita (padrão: fake, em qualquer
  // ambiente). Nunca é inferido do ambiente nem de modo/allowlist.
  realTransport?: boolean;
};

// Subconjunto do client de transação que o enqueue transacional usa.
type DispatchTransaction = Pick<
  Prisma.TransactionClient,
  "$executeRawUnsafe" | "emailDispatch" | "planPurchase" | "user"
>;

const PURCHASE_CONFIRMATION_EXPIRY_MS = 24 * HOUR_MS;
const ENQUEUE_SAVEPOINT = "email_dispatch_enqueue";

export type SendTestResult =
  | { sent: true; dispatchId: string; result: EmailSendResult }
  | { sent: false; reason: string };

@Injectable()
export class EmailDispatchService {
  private readonly logger = new Logger(EmailDispatchService.name);

  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(EmailDispatchConfigService)
    private readonly config: EmailDispatchConfigService,
    @Inject(EMAIL_SERVICE) private readonly emailService: EmailService,
    @Inject(EmailSuppressionService)
    private readonly suppression: Pick<EmailSuppressionService, "findByEmail">,
  ) {}

  // Chamado pelos ganchos de auth DEPOIS que o e-mail foi de fato
  // verificado (verifyEmail, ou cadastro social de usuário realmente novo).
  // Cria boas-vindas + feedback de uma vez, ambos idempotentes por
  // dedupeKey (chamar duas vezes nunca cria duas linhas). NUNCA lança: um
  // problema aqui jamais pode quebrar verificação de e-mail nem login.
  async enqueueRelationshipForVerifiedUser(
    userId: string,
    now: Date = new Date(),
  ): Promise<{ welcome: boolean; feedback: boolean }> {
    const none = { welcome: false, feedback: false };

    try {
      const startAt = this.config.getStartAt();
      if (!startAt) return none;

      const welcomeMode = this.config.getEffectiveMode("WELCOME");
      const feedbackMode = this.config.getEffectiveMode("FEEDBACK_FIRST_USE");
      if (welcomeMode === "OFF" && feedbackMode === "OFF") return none;

      const user = await this.database.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          createdAt: true,
          emailVerifiedAt: true,
        },
      });

      // Só e-mail verificado, e só cadastro novo (cutoff) — a base antiga
      // nunca entra, nem por verificação tardia.
      if (!user?.emailVerifiedAt || user.createdAt < startAt) return none;

      const welcomeScheduledFor = new Date(now.getTime() + WELCOME_DELAY_MS);
      const feedbackScheduledFor = computeFeedbackScheduledFor({
        createdAt: user.createdAt,
        welcomeScheduledFor,
      });

      const rows: Array<{
        kind: EmailDispatchKind;
        userId: string;
        recipientEmail: string;
        dedupeKey: string;
        scheduledFor: Date;
        expiresAt: Date;
      }> = [];

      if (welcomeMode !== "OFF") {
        rows.push({
          kind: "WELCOME",
          userId: user.id,
          recipientEmail: user.email,
          dedupeKey: `welcome:${user.id}`,
          scheduledFor: welcomeScheduledFor,
          expiresAt: new Date(
            welcomeScheduledFor.getTime() + WELCOME_EXPIRY_MS,
          ),
        });
      }
      if (feedbackMode !== "OFF") {
        rows.push({
          kind: "FEEDBACK_FIRST_USE",
          userId: user.id,
          recipientEmail: user.email,
          dedupeKey: `feedback:${user.id}`,
          scheduledFor: feedbackScheduledFor,
          expiresAt: new Date(
            feedbackScheduledFor.getTime() + FEEDBACK_EXPIRY_MS,
          ),
        });
      }

      // skipDuplicates (INSERT ... ON CONFLICT DO NOTHING): dedupe sem
      // erro de unique — importante porque este método pode rodar dentro
      // de fluxos concorrentes (duas verificações simultâneas).
      await this.database.emailDispatch.createMany({
        data: rows,
        skipDuplicates: true,
      });

      return {
        welcome: welcomeMode !== "OFF",
        feedback: feedbackMode !== "OFF",
      };
    } catch (error) {
      this.logger.error(
        `email_dispatch_enqueue_failed kind=RELATIONSHIP userId=${userId} reason=${
          error instanceof Error ? error.message : "unknown error"
        }`,
      );
      return none;
    }
  }

  // VIEWED só com evidência confiável: evento analysis_result_viewed
  // gravado COM userId. O userId vem do access token JWT verificado no
  // middleware de contexto — só existe quando a pessoa estava logada ao
  // ver o resultado. Ausência do evento NÃO prova que não viu: o evento é
  // emitido pelo frontend e só quando há consentimento de analytics, e a
  // visualização como convidado (antes do cadastro) fica sem userId. Por
  // isso o complemento de VIEWED é NEUTRAL, nunca "não viu".
  async resolveFeedbackVariant(userId: string): Promise<FeedbackVariant> {
    const evidence = await this.database.businessFunnelEvent.findFirst({
      where: { userId, eventName: "analysis_result_viewed" },
      select: { id: true },
    });
    return evidence ? "VIEWED" : "NEUTRAL";
  }

  // Confirmação de compra — chamada de DENTRO da transação de aprovação
  // (PlansService.applyApprovedPurchaseInsideTransaction), logo depois que
  // os créditos foram aplicados. Todos os caminhos de aprovação (webhook do
  // Mercado Pago, applyApprovedPurchase/reconciliação, resgate de cupom
  // 100%) passam por essa função, então um único gancho cobre todos.
  //
  // INVARIANTE: falha aqui NUNCA pode impedir a disponibilização dos
  // créditos. Um erro SQL dentro de uma transação Postgres aborta a
  // transação inteira — por isso o insert roda dentro de um SAVEPOINT: se
  // falhar (tabela/enum ausente, dado inválido...), faz ROLLBACK TO
  // SAVEPOINT e a transação de crédito segue e commita normalmente. Nunca
  // lança. O dedupe é por compra (purchase:{id}, único no banco; o
  // updateMany condicional da aprovação já garante 1 execução por compra, e
  // o createMany skipDuplicates cobre qualquer repetição).
  async enqueuePurchaseConfirmationInTransaction(
    tx: DispatchTransaction,
    input: {
      purchaseId: string;
      userId: string;
      creditsApplied: number;
      analysisCreditsApplied: number;
      isUnlimited: boolean;
    },
    now: Date = new Date(),
  ): Promise<boolean> {
    // Modo OFF (padrão) = zero pegada: nem savepoint, nem consulta.
    if (this.config.getEffectiveMode("PURCHASE_CONFIRMATION") === "OFF") {
      return false;
    }
    const startAt = this.config.getStartAt();
    if (!startAt) return false;

    let savepointOpen = false;
    try {
      await tx.$executeRawUnsafe(`SAVEPOINT ${ENQUEUE_SAVEPOINT}`);
      savepointOpen = true;

      const [purchase, user] = await Promise.all([
        tx.planPurchase.findUnique({
          where: { id: input.purchaseId },
          select: {
            planType: true,
            amountInCents: true,
            currency: true,
            paymentProvider: true,
            createdAt: true,
          },
        }),
        tx.user.findUnique({
          where: { id: input.userId },
          select: { email: true },
        }),
      ]);

      // Cutoff: só compras criadas a partir da ativação — reconciliações/
      // reparos de compras antigas nunca disparam e-mail.
      if (!purchase || !user || purchase.createdAt < startAt) {
        await tx.$executeRawUnsafe(`RELEASE SAVEPOINT ${ENQUEUE_SAVEPOINT}`);
        return false;
      }

      const payload: PurchaseConfirmationPayload = {
        planType: purchase.planType,
        amountInCents: purchase.amountInCents,
        currency: purchase.currency,
        credits: input.creditsApplied,
        analysisCredits: input.analysisCreditsApplied,
        isUnlimited: input.isUnlimited,
        // Sem pagamento: cupom 100% (internal_coupon, valor zero).
        isCouponRedemption:
          purchase.paymentProvider === "internal_coupon" ||
          purchase.amountInCents === 0,
      };

      await tx.emailDispatch.createMany({
        data: [
          {
            kind: "PURCHASE_CONFIRMATION",
            userId: input.userId,
            recipientEmail: user.email,
            referenceId: input.purchaseId,
            payloadJson: payload as unknown as Prisma.InputJsonValue,
            dedupeKey: `purchase:${input.purchaseId}`,
            scheduledFor: now,
            expiresAt: new Date(
              now.getTime() + PURCHASE_CONFIRMATION_EXPIRY_MS,
            ),
          },
        ],
        skipDuplicates: true,
      });

      await tx.$executeRawUnsafe(`RELEASE SAVEPOINT ${ENQUEUE_SAVEPOINT}`);
      return true;
    } catch (error) {
      this.logger.error(
        `email_dispatch_enqueue_failed kind=PURCHASE_CONFIRMATION purchaseId=${input.purchaseId} credits_unaffected=true reason=${
          error instanceof Error ? error.message : "unknown error"
        }`,
      );
      if (savepointOpen) {
        try {
          await tx.$executeRawUnsafe(
            `ROLLBACK TO SAVEPOINT ${ENQUEUE_SAVEPOINT}`,
          );
        } catch {
          // Sem savepoint utilizável não há o que fazer aqui; a transação
          // chamadora decide. Nunca propaga.
        }
      }
      return false;
    }
  }

  // Envio efetivo de UMA linha já claimada. Sem decisão de negócio aqui
  // (elegibilidade/modo/janela são do worker).
  //
  // realTransport=false (padrão de quem não é produção) NÃO chama o
  // provider: devolve um resultado fake (providerMessageId "fake:<id>").
  // Relacionamento sai pelo SES (categoria RELATIONSHIP, tópico próprio);
  // confirmação de compra sai pelo Resend (categoria BILLING, SEM
  // ListManagementOptions — transacional, sem descadastro).
  async deliver(input: {
    dispatchId: string;
    kind: EmailDispatchKind;
    to: string;
    name: string | null | undefined;
    variant: FeedbackVariant | null;
    payload?: PurchaseConfirmationPayload | null;
    realTransport: boolean;
  }): Promise<EmailSendResult> {
    const isPurchase = input.kind === "PURCHASE_CONFIRMATION";
    const provider = isPurchase ? "RESEND" : "SES";

    if (!input.realTransport) {
      // Renderiza mesmo assim: um template quebrado precisa falhar aqui.
      renderDispatchEmail(input);
      this.logger.log(
        `email dispatch fake transport (nothing sent): kind=${input.kind} dispatchId=${input.dispatchId}`,
      );
      return {
        outcome: "SENT",
        provider,
        providerMessageId: `fake:${input.dispatchId}`,
      };
    }

    const rendered = renderDispatchEmail(input);

    if (isPurchase) {
      const readiness = this.config.checkPurchaseSendReadiness();
      if (!readiness.ready) {
        throw new Error(`purchase send not ready: ${readiness.reason}`);
      }
      return this.emailService.send({
        category: "BILLING",
        message: buildBillingMessage({
          dispatchId: input.dispatchId,
          to: input.to,
          rendered,
        }),
      });
    }

    const readiness = this.config.checkSendReadiness();
    if (!readiness.ready) {
      throw new Error(`relationship send not ready: ${readiness.reason}`);
    }

    return this.emailService.send({
      category: "RELATIONSHIP",
      message: buildRelationshipMessage({
        dispatchId: input.dispatchId,
        kind: input.kind,
        to: input.to,
        rendered,
        contactListName: readiness.contactListName,
        topicName: readiness.topicName,
      }),
    });
  }

  // Teste EXPLÍCITO: destinatário informado (pode ser uma das contas
  // bloqueadas da automação), um único envio, NUNCA varre a base. Por padrão
  // o transporte é FAKE (nada sai pela rede) em qualquer ambiente; envio
  // real exige realTransport:true (no script, --real-send) e a mesma infra
  // completa do envio automático. Só o endereço suprimido (bounce duro/
  // complaint) continua barrado.
  async sendTest(input: SendTestInput): Promise<SendTestResult> {
    const realTransport = input.realTransport === true;
    const isPurchase = input.kind === "PURCHASE_CONFIRMATION";

    if (isPurchase && !input.payload) {
      return { sent: false, reason: "payload_required" };
    }

    if (realTransport) {
      const readiness = isPurchase
        ? this.config.checkPurchaseSendReadiness()
        : this.config.checkSendReadiness();
      if (!readiness.ready) {
        return { sent: false, reason: `not_ready:${readiness.reason}` };
      }
    }

    const suppressed = await this.suppression.findByEmail(input.to);
    if (suppressed) {
      return { sent: false, reason: `suppressed:${suppressed.reason}` };
    }

    const now = new Date();
    const dispatch = await this.database.emailDispatch.create({
      data: {
        kind: input.kind,
        userId: null,
        recipientEmail: input.to.trim().toLowerCase(),
        dedupeKey: `test:${randomUUID()}`,
        status: "PROCESSING",
        scheduledFor: now,
        expiresAt: new Date(now.getTime() + HOUR_MS),
        isTest: true,
        variant:
          input.kind === "FEEDBACK_FIRST_USE"
            ? (input.variant ?? "NEUTRAL")
            : null,
        payloadJson: isPurchase
          ? (input.payload as unknown as Prisma.InputJsonValue)
          : undefined,
      },
    });

    try {
      const result = await this.deliver({
        dispatchId: dispatch.id,
        kind: input.kind,
        to: dispatch.recipientEmail,
        name: input.name,
        variant:
          input.kind === "FEEDBACK_FIRST_USE"
            ? (input.variant ?? "NEUTRAL")
            : null,
        payload: input.payload ?? null,
        realTransport,
      });

      await this.database.emailDispatch.update({
        where: { id: dispatch.id },
        data:
          result.outcome === "SENT"
            ? {
                status: "SENT",
                sentAt: new Date(),
                provider: result.provider,
                providerMessageId: result.providerMessageId,
              }
            : {
                status:
                  result.outcome === "FAILED" ? "FAILED" : "OUTCOME_UNKNOWN",
                provider: result.provider,
                lastError: result.errorMessage ?? null,
                outcomeUnknownAt:
                  result.outcome === "OUTCOME_UNKNOWN" ? new Date() : null,
              },
      });

      return { sent: true, dispatchId: dispatch.id, result };
    } catch (error) {
      await this.database.emailDispatch.update({
        where: { id: dispatch.id },
        data: {
          status: "FAILED",
          lastError: error instanceof Error ? error.message : "unknown error",
        },
      });
      throw error;
    }
  }
}
