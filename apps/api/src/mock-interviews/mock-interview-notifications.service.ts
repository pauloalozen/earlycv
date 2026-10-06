import { createHash } from "node:crypto";
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

  // Convite da sessão agendada (data/hora + link da chamada), disparado pelo
  // admin ao salvar. Síncrono e sem retry automático: o resultado volta para
  // a tela do admin, que pode salvar de novo. Nunca lança.
  async sendScheduleInvite(
    purchaseId: string,
    kind: ScheduleInviteKind,
  ): Promise<{ status: "sent" | "failed"; error: string | null }> {
    try {
      const purchase = await this.database.mockInterviewPurchase.findUnique({
        where: { id: purchaseId },
        include: { user: { select: { name: true, email: true } } },
      });
      if (!purchase?.scheduledAt || !purchase.meetingUrl) {
        return { status: "failed", error: "sessão sem data ou sem link" };
      }

      const message = buildScheduleInviteEmail({
        purchaseId,
        buyerName: purchase.user.name,
        scheduledAt: purchase.scheduledAt,
        meetingUrl: purchase.meetingUrl,
        kind,
      });
      // Mesma data + mesmo link = mesma chave: salvar de novo sem mudança
      // não duplica no Resend.
      const stateKey = createHash("sha256")
        .update(`${purchase.scheduledAt.toISOString()}|${purchase.meetingUrl}`)
        .digest("hex")
        .slice(0, 16);

      const result = await this.emailService.send({
        category: "BILLING",
        message: {
          to: purchase.user.email,
          subject: message.subject,
          text: message.text,
          html: message.html,
          idempotencyKey: `mock-interview-invite:${purchaseId}:${stateKey}`,
          tags: {
            correlationType: "MOCK_INTERVIEW",
            correlationId: purchaseId,
          },
        },
      });
      if (result.outcome === "SENT") return { status: "sent", error: null };
      return {
        status: "failed",
        error: result.errorMessage ?? result.outcome,
      };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `mock_interview_invite_failed purchaseId=${purchaseId} reason=${reason}`,
      );
      return { status: "failed", error: reason };
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

export type ScheduleInviteKind = "scheduled" | "rescheduled" | "updated";

const SAO_PAULO = "America/Sao_Paulo";

function formatSessionDate(date: Date): string {
  const text = new Intl.DateTimeFormat("pt-BR", {
    timeZone: SAO_PAULO,
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// Link "Adicionar ao Google Agenda" (sem anexo .ics: o envio não suporta
// anexos). Datas em UTC no formato do Google (YYYYMMDDTHHmmssZ).
export function buildGoogleCalendarUrl(input: {
  start: Date;
  durationMinutes: number;
  title: string;
  details: string;
  location: string;
}): string {
  const fmt = (d: Date) =>
    d
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\.\d{3}/, "");
  const end = new Date(input.start.getTime() + input.durationMinutes * 60_000);
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: input.title,
    dates: `${fmt(input.start)}/${fmt(end)}`,
    details: input.details,
    location: input.location,
  });
  return `https://calendar.google.com/calendar/render?${params}`;
}

export function buildScheduleInviteEmail(input: {
  purchaseId: string;
  buyerName: string;
  scheduledAt: Date;
  meetingUrl: string;
  kind: ScheduleInviteKind;
}) {
  const code = purchaseCode(input.purchaseId);
  const first = input.buyerName?.trim().split(/\s+/)[0];
  const when = formatSessionDate(input.scheduledAt);
  const minutes = MOCK_INTERVIEW_PRODUCT.durationMinutes;
  const orderUrl = `${resolveFrontendUrl().replace(/\/$/, "")}/simulacao-de-entrevista/pedido/${input.purchaseId}`;
  const calendarUrl = buildGoogleCalendarUrl({
    start: input.scheduledAt,
    durationMinutes: minutes,
    title: "Entrevista simulada com Paulo (EarlyCV)",
    details: `Entrevista simulada do pedido #${code}.\nLink da chamada: ${input.meetingUrl}`,
    location: input.meetingUrl,
  });

  const intro =
    input.kind === "rescheduled"
      ? "Sua entrevista simulada foi remarcada. Este é o novo horário:"
      : input.kind === "updated"
        ? "Atualizei os dados da sua entrevista simulada. Confira:"
        : "Sua entrevista simulada está marcada!";
  const subject =
    input.kind === "rescheduled"
      ? `Entrevista simulada remarcada: ${when}`
      : input.kind === "updated"
        ? `Entrevista simulada atualizada: ${when}`
        : `Entrevista simulada marcada: ${when}`;

  const rules = `Precisa remarcar? Me avise no WhatsApp com pelo menos ${MOCK_INTERVIEW_PRODUCT.rescheduleHoursBefore} horas de antecedência. Se você não comparecer no horário combinado, a sessão conta como realizada.`;
  const tips =
    "Para aproveitar melhor: tenha a descrição da vaga à mão, esteja num lugar silencioso, com câmera e microfone funcionando, e entre uns minutos antes.";

  const text = [
    first ? `Oi, ${first}!` : "Oi!",
    intro,
    `Quando: ${when} (horário de Brasília)\nDuração: ${minutes} minutos\nOnde: Google Meet\nLink da chamada: ${input.meetingUrl}`,
    `Adicionar ao Google Agenda: ${calendarUrl}`,
    tips,
    rules,
    `Detalhes do pedido #${code}: ${orderUrl}`,
    "Até lá,\nPaulo\nEarlyCV",
  ].join("\n\n");

  const e = escapeHtml;
  const p = (content: string) =>
    `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#3a3a36;">${content}</p>`;
  const html = `<div style="font-family:-apple-system,Segoe UI,sans-serif;max-width:520px;margin:0 auto;color:#0a0a0a;">
${p(e(first ? `Oi, ${first}!` : "Oi!"))}
${p(e(intro))}
<div style="background:#fafaf6;border:1px solid rgba(10,10,10,0.08);border-radius:10px;padding:16px 18px;margin:0 0 18px;font-size:14px;line-height:1.7;">
  <div><strong>Quando:</strong> ${e(when)} (horário de Brasília)</div>
  <div><strong>Duração:</strong> ${minutes} minutos</div>
  <div><strong>Onde:</strong> Google Meet</div>
</div>
<p style="margin:0 0 10px;">
  <a href="${e(input.meetingUrl)}" style="background:#0a0a0a;color:#fafaf6;padding:12px 20px;border-radius:9px;text-decoration:none;font-weight:600;display:inline-block;">Entrar na chamada</a>
  <a href="${e(calendarUrl)}" style="margin-left:8px;color:#0a0a0a;padding:11px 16px;border:1px solid rgba(10,10,10,0.2);border-radius:9px;text-decoration:none;font-weight:600;display:inline-block;">Adicionar à agenda</a>
</p>
<p style="margin:0 0 18px;font-size:12px;color:#6a6560;word-break:break-all;">Link da chamada: <a href="${e(input.meetingUrl)}" style="color:#6a6560;">${e(input.meetingUrl)}</a></p>
${p(e(tips))}
${p(e(rules))}
${p(`Detalhes do pedido <a href="${e(orderUrl)}" style="color:#0a0a0a;">#${e(code)}</a>`)}
${p("Até lá,<br />Paulo<br />EarlyCV")}
</div>`;

  return { subject, text, html };
}
