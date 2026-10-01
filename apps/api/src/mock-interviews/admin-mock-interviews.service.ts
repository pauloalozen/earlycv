import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type {
  MockInterviewSessionStatus,
  PaymentStatus,
  Prisma,
} from "@prisma/client";

import { DatabaseService } from "../database/database.service";
import { MOCK_INTERVIEW_PRODUCT, purchaseCode } from "./mock-interview.config";
import { toPublicPaymentStatus } from "./mock-interviews.service";

const HOUR_MS = 60 * 60_000;

export type AdminPaymentFilter = "paid" | "refunded" | "pending" | "all";

// Status que o admin pode definir. REFUNDED só vem do webhook do MP (o
// estorno é feito no painel do Mercado Pago).
const ADMIN_SETTABLE_STATUSES: MockInterviewSessionStatus[] = [
  "AWAITING_SCHEDULING",
  "SCHEDULED",
  "COMPLETED",
  "NO_SHOW",
  "CANCELLED",
];

export type AdminUpdateInput = {
  scheduledAt?: string | null;
  meetingUrl?: string | null;
  sessionStatus?: MockInterviewSessionStatus;
  adminNotes?: string | null;
  reportSent?: boolean;
};

function paymentWhere(
  filter: AdminPaymentFilter,
): Prisma.MockInterviewPurchaseWhereInput {
  if (filter === "paid") return { paymentStatus: "completed" };
  if (filter === "refunded") return { paymentStatus: "refunded" };
  if (filter === "pending") {
    return {
      paymentStatus: {
        in: [
          "none",
          "pending",
          "processing_payment",
          "pending_payment",
          "failed",
        ],
      },
    };
  }
  return {};
}

// Regra exibida ao admin: reembolso integral até 24h antes do horário
// agendado (ou a qualquer momento antes de agendar), só com sessão ainda
// não realizada.
export function computeRefundEligibility(
  purchase: {
    paymentStatus: PaymentStatus;
    sessionStatus: MockInterviewSessionStatus;
    scheduledAt: Date | null;
  },
  now: Date = new Date(),
): { eligible: boolean; reason: string } {
  if (purchase.paymentStatus !== "completed") {
    return { eligible: false, reason: "Pagamento não está confirmado." };
  }
  if (
    purchase.sessionStatus !== "AWAITING_SCHEDULING" &&
    purchase.sessionStatus !== "SCHEDULED"
  ) {
    return { eligible: false, reason: "Sessão já encerrada." };
  }
  if (!purchase.scheduledAt) {
    return { eligible: true, reason: "Sessão ainda não agendada." };
  }
  const deadline =
    purchase.scheduledAt.getTime() -
    MOCK_INTERVIEW_PRODUCT.refundHoursBefore * HOUR_MS;
  return now.getTime() <= deadline
    ? {
        eligible: true,
        reason: `Dentro do prazo (até ${MOCK_INTERVIEW_PRODUCT.refundHoursBefore}h antes).`,
      }
    : {
        eligible: false,
        reason: `Fora do prazo (menos de ${MOCK_INTERVIEW_PRODUCT.refundHoursBefore}h antes do horário).`,
      };
}

@Injectable()
export class AdminMockInterviewsService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
  ) {}

  async list(query: {
    page?: number;
    limit?: number;
    payment?: AdminPaymentFilter;
    session?: MockInterviewSessionStatus;
    q?: string;
  }) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const search = query.q?.trim();

    const where: Prisma.MockInterviewPurchaseWhereInput = {
      ...paymentWhere(query.payment ?? "paid"),
      ...(query.session ? { sessionStatus: query.session } : {}),
      ...(search
        ? {
            OR: [
              { id: { endsWith: search.toLowerCase() } },
              { user: { email: { contains: search, mode: "insensitive" } } },
              { user: { name: { contains: search, mode: "insensitive" } } },
            ],
          }
        : {}),
    };

    const [total, rows, summary] = await Promise.all([
      this.database.mockInterviewPurchase.count({ where }),
      this.database.mockInterviewPurchase.findMany({
        where,
        // Mais recente primeiro: o pago mais novo é o que precisa de agenda.
        orderBy: [{ createdAt: "desc" }],
        skip: (page - 1) * limit,
        take: limit,
        include: { user: { select: { id: true, name: true, email: true } } },
      }),
      this.summary(),
    ]);

    return {
      items: rows.map((row) => ({
        id: row.id,
        code: purchaseCode(row.id),
        buyer: row.user,
        amountInCents: row.amountInCents,
        currency: row.currency,
        paymentStatus: toPublicPaymentStatus(row.paymentStatus),
        sessionStatus: row.sessionStatus,
        scheduledAt: row.scheduledAt?.toISOString() ?? null,
        reportSentAt: row.reportSentAt?.toISOString() ?? null,
        origin: row.origin,
        createdAt: row.createdAt.toISOString(),
        paidAt: row.paidAt?.toISOString() ?? null,
      })),
      page,
      limit,
      total,
      summary,
    };
  }

  private async summary() {
    const [byStatus, revenue] = await Promise.all([
      this.database.mockInterviewPurchase.groupBy({
        by: ["sessionStatus"],
        where: { paymentStatus: "completed" },
        _count: { _all: true },
      }),
      this.database.mockInterviewPurchase.aggregate({
        where: { paymentStatus: "completed" },
        _sum: { amountInCents: true },
        _count: { _all: true },
      }),
    ]);
    const count = (status: MockInterviewSessionStatus) =>
      byStatus.find((row) => row.sessionStatus === status)?._count._all ?? 0;
    return {
      paidCount: revenue._count._all,
      revenueInCents: revenue._sum.amountInCents ?? 0,
      awaitingScheduling: count("AWAITING_SCHEDULING"),
      scheduled: count("SCHEDULED"),
      completed: count("COMPLETED"),
      noShow: count("NO_SHOW"),
    };
  }

  async detail(id: string, now: Date = new Date()) {
    const purchase = await this.database.mockInterviewPurchase.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, name: true, email: true } },
        events: { orderBy: { createdAt: "desc" }, take: 100 },
      },
    });
    if (!purchase) throw new NotFoundException("Compra não encontrada.");

    const application = purchase.originJobApplicationId
      ? await this.database.jobApplication.findUnique({
          where: { id: purchase.originJobApplicationId },
          select: {
            id: true,
            jobTitle: true,
            companyName: true,
            status: true,
            nextActionAt: true,
          },
        })
      : null;

    return {
      id: purchase.id,
      code: purchaseCode(purchase.id),
      buyer: purchase.user,
      amountInCents: purchase.amountInCents,
      currency: purchase.currency,
      paymentStatus: toPublicPaymentStatus(purchase.paymentStatus),
      paymentStatusRaw: purchase.paymentStatus,
      paymentMethod: purchase.paymentMethod,
      mpPaymentId: purchase.mpPaymentId,
      paidAt: purchase.paidAt?.toISOString() ?? null,
      refundedAt: purchase.refundedAt?.toISOString() ?? null,
      origin: purchase.origin,
      application: application
        ? {
            ...application,
            nextActionAt: application.nextActionAt?.toISOString() ?? null,
          }
        : null,
      policyVersion: purchase.policyVersion,
      policyAcceptedAt: purchase.policyAcceptedAt.toISOString(),
      sessionStatus: purchase.sessionStatus,
      scheduledAt: purchase.scheduledAt?.toISOString() ?? null,
      meetingUrl: purchase.meetingUrl,
      completedAt: purchase.completedAt?.toISOString() ?? null,
      reportSentAt: purchase.reportSentAt?.toISOString() ?? null,
      rescheduleCount: purchase.rescheduleCount,
      adminNotes: purchase.adminNotes,
      notifications: {
        adminNotifiedAt: purchase.adminNotifiedAt?.toISOString() ?? null,
        adminNotifyError: purchase.adminNotifyError,
        buyerNotifiedAt: purchase.buyerNotifiedAt?.toISOString() ?? null,
        buyerNotifyError: purchase.buyerNotifyError,
      },
      refund: computeRefundEligibility(purchase, now),
      createdAt: purchase.createdAt.toISOString(),
      events: purchase.events.map((event) => ({
        id: event.id,
        type: event.type,
        actor: event.actor,
        fromValue: event.fromValue,
        toValue: event.toValue,
        note: event.note,
        createdAt: event.createdAt.toISOString(),
      })),
    };
  }

  async update(
    id: string,
    adminId: string,
    input: AdminUpdateInput,
    now: Date = new Date(),
  ) {
    const purchase = await this.database.mockInterviewPurchase.findUnique({
      where: { id },
    });
    if (!purchase) throw new NotFoundException("Compra não encontrada.");
    if (purchase.paymentStatus !== "completed") {
      throw new BadRequestException(
        "Só compras com pagamento confirmado podem ser agendadas ou alteradas.",
      );
    }

    const data: Prisma.MockInterviewPurchaseUpdateInput = {};
    const events: Prisma.MockInterviewEventCreateManyPurchaseInput[] = [];
    const actor = `admin:${adminId}`;

    if (input.scheduledAt !== undefined) {
      const next = input.scheduledAt ? new Date(input.scheduledAt) : null;
      if (next && Number.isNaN(next.getTime())) {
        throw new BadRequestException("Data e hora inválidas.");
      }
      const previous = purchase.scheduledAt;
      const changed =
        (previous?.getTime() ?? null) !== (next?.getTime() ?? null);
      if (changed) {
        data.scheduledAt = next;
        if (previous && next) {
          data.rescheduleCount = { increment: 1 };
          const lateReschedule =
            now.getTime() >
            previous.getTime() -
              MOCK_INTERVIEW_PRODUCT.rescheduleHoursBefore * HOUR_MS;
          events.push({
            type: "rescheduled",
            actor,
            fromValue: previous.toISOString(),
            toValue: next.toISOString(),
            note: lateReschedule
              ? `Remarcado com menos de ${MOCK_INTERVIEW_PRODUCT.rescheduleHoursBefore}h de antecedência.`
              : null,
          });
        } else {
          events.push({
            type: next ? "scheduled" : "schedule_cleared",
            actor,
            fromValue: previous?.toISOString() ?? null,
            toValue: next?.toISOString() ?? null,
          });
        }
        // Agendar move a sessão para SCHEDULED, a menos que o admin esteja
        // definindo outro status na mesma operação.
        if (
          next &&
          input.sessionStatus === undefined &&
          purchase.sessionStatus === "AWAITING_SCHEDULING"
        ) {
          data.sessionStatus = "SCHEDULED";
          events.push({
            type: "session_status_changed",
            actor,
            fromValue: purchase.sessionStatus,
            toValue: "SCHEDULED",
          });
        }
      }
    }

    if (input.meetingUrl !== undefined) {
      const url = input.meetingUrl?.trim() || null;
      if (url && !/^https:\/\//.test(url)) {
        throw new BadRequestException(
          "O link da chamada precisa começar com https://.",
        );
      }
      if (url !== purchase.meetingUrl) {
        data.meetingUrl = url;
        events.push({ type: "meeting_url_changed", actor, toValue: url });
      }
    }

    if (
      input.sessionStatus !== undefined &&
      input.sessionStatus !== purchase.sessionStatus
    ) {
      if (!ADMIN_SETTABLE_STATUSES.includes(input.sessionStatus)) {
        throw new BadRequestException(
          "Estorno é registrado automaticamente pelo Mercado Pago.",
        );
      }
      if (purchase.sessionStatus === "REFUNDED") {
        throw new BadRequestException(
          "Compra estornada não pode mudar de status.",
        );
      }
      const scheduledAfter =
        data.scheduledAt !== undefined
          ? (data.scheduledAt as Date | null)
          : purchase.scheduledAt;
      if (input.sessionStatus === "SCHEDULED" && !scheduledAfter) {
        throw new BadRequestException(
          "Informe a data e hora para marcar como agendada.",
        );
      }
      data.sessionStatus = input.sessionStatus;
      data.completedAt = input.sessionStatus === "COMPLETED" ? now : null;
      events.push({
        type: "session_status_changed",
        actor,
        fromValue: purchase.sessionStatus,
        toValue: input.sessionStatus,
      });
    }

    if (input.adminNotes !== undefined) {
      const notes = input.adminNotes?.trim() || null;
      if (notes !== purchase.adminNotes) {
        data.adminNotes = notes;
        events.push({ type: "notes_updated", actor });
      }
    }

    if (input.reportSent !== undefined) {
      const sent = Boolean(purchase.reportSentAt);
      if (input.reportSent !== sent) {
        data.reportSentAt = input.reportSent ? now : null;
        events.push({
          type: input.reportSent ? "report_sent" : "report_unmarked",
          actor,
        });
      }
    }

    if (events.length === 0) return this.detail(id, now);

    await this.database.mockInterviewPurchase.update({
      where: { id },
      data: { ...data, events: { createMany: { data: events } } },
    });
    return this.detail(id, now);
  }
}
