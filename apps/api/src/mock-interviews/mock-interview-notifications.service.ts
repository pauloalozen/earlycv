import { Inject, Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";

import { trackJob } from "../common/memory-diagnostics";
import { DatabaseService } from "../database/database.service";
import { EMAIL_SERVICE, type EmailService } from "../email/email.types";
import {
  getAdminNotificationEmail,
  MOCK_INTERVIEW_PRODUCT,
  purchaseCode,
  resolveFrontendUrl,
} from "./mock-interview.config";

const STALE_CLAIM_MS = 15 * 60_000;
const RETRY_WINDOW_MS = 3 * 24 * 60 * 60_000;

type Target = "admin" | "buyer";

const CLAIM_FIELD = {
  admin: "adminNotifyClaimedAt",
  buyer: "buyerNotifyClaimedAt",
} as const;
const SENT_FIELD = {
  admin: "adminNotifiedAt",
  buyer: "buyerNotifiedAt",
} as const;
const ERROR_FIELD = {
  admin: "adminNotifyError",
  buyer: "buyerNotifyError",
} as const;

function formatMoney(amountInCents: number, currency: string): string {
  try {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency,
    }).format(amountInCents / 100);
  } catch {
    return `${(amountInCents / 100).toFixed(2)} ${currency}`;
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function toHtml(paragraphs: string[]): string {
  return `<div style="font-family:-apple-system,Segoe UI,sans-serif;font-size:15px;line-height:1.55;color:#0a0a0a;max-width:560px;">
${paragraphs.map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br />")}</p>`).join("\n")}
</div>`;
}

const ORIGIN_LABELS: Record<string, string> = {
  landing: "Landing da entrevista simulada",
  application_offer: "Oferta na candidatura (app)",
  offer_email: "E-mail de oferta",
  showcase: "Landing principal",
  other: "Outro",
};

// E-mails transacionais da compra (categoria BILLING: Resend em produção,
// transporte fake fora dela). Independentes dos modos do dispatch de
// relacionamento de propósito: aviso de venda e recibo nunca podem ficar
// desligados por configuração de marketing.
//
// Idempotência: claim atômico (updateMany condicional no *ClaimedAt) — só um
// processo envia; Idempotency-Key no Resend cobre a repetição após falha
// ambígua. Falha confirmada libera o claim para nova tentativa do cron.
@Injectable()
export class MockInterviewNotificationsService {
  private readonly logger = new Logger(MockInterviewNotificationsService.name);

  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(EMAIL_SERVICE) private readonly emailService: EmailService,
  ) {}

  // Chamado logo depois da aprovação. Nunca lança.
  async notifyPurchaseApproved(purchaseId: string): Promise<void> {
    await this.send(purchaseId, "admin");
    await this.send(purchaseId, "buyer");
  }

  @Cron("0 */5 * * * *")
  async retryPending(): Promise<void> {
    if (process.env.NODE_ENV === "test") return;
    await trackJob("mock-interview-notifications", () => this.processPending());
  }

  async processPending(now: Date = new Date()): Promise<number> {
    const staleBefore = new Date(now.getTime() - STALE_CLAIM_MS);
    const paidAfter = new Date(now.getTime() - RETRY_WINDOW_MS);
    let processed = 0;

    for (const target of ["admin", "buyer"] as const) {
      const rows = await this.database.mockInterviewPurchase.findMany({
        where: {
          paymentStatus: "completed",
          paidAt: { gte: paidAfter },
          [SENT_FIELD[target]]: null,
          OR: [
            { [CLAIM_FIELD[target]]: null },
            { [CLAIM_FIELD[target]]: { lt: staleBefore } },
          ],
        },
        select: { id: true },
        take: 20,
      });
      for (const row of rows) {
        await this.send(row.id, target, staleBefore);
        processed += 1;
      }
    }
    return processed;
  }

  private async send(
    purchaseId: string,
    target: Target,
    staleBefore?: Date,
  ): Promise<boolean> {
    try {
      const claim = await this.database.mockInterviewPurchase.updateMany({
        where: {
          id: purchaseId,
          paymentStatus: "completed",
          [SENT_FIELD[target]]: null,
          OR: [
            { [CLAIM_FIELD[target]]: null },
            ...(staleBefore
              ? [{ [CLAIM_FIELD[target]]: { lt: staleBefore } }]
              : []),
          ],
        },
        data: { [CLAIM_FIELD[target]]: new Date() },
      });
      if (claim.count !== 1) return false;

      const purchase = await this.database.mockInterviewPurchase.findUnique({
        where: { id: purchaseId },
        include: { user: { select: { name: true, email: true } } },
      });
      if (!purchase) return false;

      const to =
        target === "admin" ? getAdminNotificationEmail() : purchase.user.email;
      if (!to) {
        await this.recordFailure(
          purchaseId,
          target,
          "MOCK_INTERVIEW_ADMIN_EMAIL não configurado",
          false,
        );
        return false;
      }

      const application = purchase.originJobApplicationId
        ? await this.database.jobApplication.findUnique({
            where: { id: purchase.originJobApplicationId },
            select: { jobTitle: true, companyName: true },
          })
        : null;

      const message =
        target === "admin"
          ? buildAdminSaleEmail({
              purchaseId,
              buyerName: purchase.user.name,
              buyerEmail: purchase.user.email,
              amountInCents: purchase.amountInCents,
              currency: purchase.currency,
              paymentMethod: purchase.paymentMethod,
              origin: purchase.origin,
              application,
            })
          : buildBuyerConfirmationEmail({
              purchaseId,
              buyerName: purchase.user.name,
              amountInCents: purchase.amountInCents,
              currency: purchase.currency,
            });

      const result = await this.emailService.send({
        category: "BILLING",
        message: {
          to,
          subject: message.subject,
          text: message.text,
          html: message.html,
          idempotencyKey: `mock-interview-${target}:${purchaseId}`,
          tags: {
            correlationType: "MOCK_INTERVIEW",
            correlationId: purchaseId,
          },
        },
      });

      if (result.outcome === "SENT") {
        await this.database.mockInterviewPurchase.update({
          where: { id: purchaseId },
          data: {
            [SENT_FIELD[target]]: new Date(),
            [ERROR_FIELD[target]]: null,
          },
        });
        return true;
      }

      // OUTCOME_UNKNOWN: mantém o claim (o cron só tenta de novo quando ele
      // envelhece, e a Idempotency-Key cobre a repetição).
      await this.recordFailure(
        purchaseId,
        target,
        result.errorMessage ?? result.outcome,
        result.outcome === "FAILED",
      );
      return false;
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `mock_interview_notify_failed target=${target} purchaseId=${purchaseId} reason=${reason}`,
      );
      await this.recordFailure(purchaseId, target, reason, true).catch(
        () => undefined,
      );
      return false;
    }
  }

  private async recordFailure(
    purchaseId: string,
    target: Target,
    reason: string,
    releaseClaim: boolean,
  ) {
    await this.database.mockInterviewPurchase.update({
      where: { id: purchaseId },
      data: {
        [ERROR_FIELD[target]]: reason.slice(0, 500),
        ...(releaseClaim ? { [CLAIM_FIELD[target]]: null } : {}),
      },
    });
  }
}

export function buildAdminSaleEmail(input: {
  purchaseId: string;
  buyerName: string;
  buyerEmail: string;
  amountInCents: number;
  currency: string;
  paymentMethod: string | null;
  origin: string;
  application: { jobTitle: string; companyName: string } | null;
}) {
  const code = purchaseCode(input.purchaseId);
  const valor = formatMoney(input.amountInCents, input.currency);
  const adminUrl = `${resolveFrontendUrl().replace(/\/$/, "")}/admin/simulados/${input.purchaseId}`;
  const paragraphs = [
    "Nova venda da entrevista simulada.",
    [
      `Pedido: #${code}`,
      `Comprador: ${input.buyerName || "(sem nome)"}`,
      `E-mail: ${input.buyerEmail}`,
      `Valor: ${valor}`,
      `Pagamento: ${input.paymentMethod ?? "não informado"}`,
      `Origem: ${ORIGIN_LABELS[input.origin] ?? input.origin}`,
      ...(input.application
        ? [
            `Candidatura: ${input.application.jobTitle} · ${input.application.companyName}`,
          ]
        : []),
    ].join("\n"),
    `A pessoa vai te chamar no WhatsApp com o código #${code}. Registre o horário combinado no admin:\n${adminUrl}`,
  ];
  return {
    subject: `Nova venda: entrevista simulada #${code} (${valor})`,
    text: paragraphs.join("\n\n"),
    html: toHtml(paragraphs),
  };
}

export function buildBuyerConfirmationEmail(input: {
  purchaseId: string;
  buyerName: string;
  amountInCents: number;
  currency: string;
}) {
  const code = purchaseCode(input.purchaseId);
  const first = input.buyerName?.trim().split(/\s+/)[0];
  const orderUrl = `${resolveFrontendUrl().replace(/\/$/, "")}/simulacao-de-entrevista/pedido/${input.purchaseId}`;
  const paragraphs = [
    first ? `Oi, ${first}!` : "Oi!",
    `Recebemos o pagamento da sua entrevista simulada (pedido #${code}, ${formatMoney(input.amountInCents, input.currency)}).`,
    `Próximo passo: me chame no WhatsApp para combinarmos o horário. O botão já está liberado na página do seu pedido:\n${orderUrl}`,
    `A sessão tem ${MOCK_INTERVIEW_PRODUCT.durationMinutes} minutos, acontece pelo Google Meet e, depois dela, você recebe um relatório formal com as minhas recomendações.`,
    `Regras: reembolso integral até ${MOCK_INTERVIEW_PRODUCT.refundHoursBefore} horas antes do horário agendado (ou a qualquer momento antes de agendar). Remarcação com pelo menos ${MOCK_INTERVIEW_PRODUCT.rescheduleHoursBefore} horas de antecedência. Se você não comparecer, o valor não é devolvido.`,
    "Até breve,\nPaulo\nEarlyCV",
  ];
  return {
    subject: "Sua entrevista simulada está confirmada",
    text: paragraphs.join("\n\n"),
    html: toHtml(paragraphs),
  };
}
