import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import type {
  EmailDispatchKind,
  EmailDispatchStatus,
  Prisma,
} from "@prisma/client";

import { DatabaseService } from "../database/database.service";
import { EmailDispatchConfigService } from "../email-dispatch/email-dispatch.config";
import { EmailDispatchService } from "../email-dispatch/email-dispatch.service";
import {
  EmailDispatchSettingsService,
  type UpdateSettingsInput,
} from "../email-dispatch/email-dispatch-settings.service";
import { EmailDispatchTemplateService } from "../email-dispatch/email-dispatch-template.service";
import {
  EMAIL_TEMPLATE_KEYS,
  type EmailTemplateKeyValue,
  type PurchaseConfirmationPayload,
  SAMPLE_PURCHASE_PAYLOAD,
  type TemplateContent,
} from "../email-dispatch/email-dispatch-templates";
import { PurchaseConfirmationRecoveryService } from "../plans/purchase-confirmation-recovery.service";
import { type EmailPeriod, resolveEmailWindow } from "./email-period";

const DEFAULT_PAGE_SIZE = 25;
const RELATIONSHIP_KINDS: EmailDispatchKind[] = [
  "WELCOME",
  "FEEDBACK_FIRST_USE",
  "FEEDBACK_SECOND_CALL",
];
const DAY_MS = 24 * 60 * 60_000;

export function assertTemplateKey(key: string): EmailTemplateKeyValue {
  if (!EMAIL_TEMPLATE_KEYS.includes(key as EmailTemplateKeyValue)) {
    throw new NotFoundException("template not found");
  }
  return key as EmailTemplateKeyValue;
}

// Camada fina da aba admin "Emails" para os tipos do dispatch (relacionamento,
// compras) + configurações, templates e supressões. Regra de negócio NUNCA é
// reimplementada aqui: delega a EmailDispatchSettingsService/TemplateService/
// EmailDispatchService/PurchaseConfirmationRecoveryService (mesmo padrão de
// AdminProductUpdatesService). Alerta de Vagas e Product Updates continuam nos
// seus próprios módulos admin — a aba só os reúne na navegação.
@Injectable()
export class AdminEmailsService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(EmailDispatchSettingsService)
    private readonly settings: EmailDispatchSettingsService,
    @Inject(EmailDispatchTemplateService)
    private readonly templates: EmailDispatchTemplateService,
    @Inject(EmailDispatchConfigService)
    private readonly config: EmailDispatchConfigService,
    @Inject(EmailDispatchService)
    private readonly dispatch: EmailDispatchService,
    @Inject(PurchaseConfirmationRecoveryService)
    private readonly recovery: PurchaseConfirmationRecoveryService,
  ) {}

  // ---- Visão geral --------------------------------------------------------

  async overview(
    query: { period?: EmailPeriod; from?: string; to?: string } = {},
    now: Date = new Date(),
  ) {
    // Só a tabela de envios segue o período escolhido; eventos (7d) e
    // supressões têm janela própria.
    const window = resolveEmailWindow(query, now);
    const inWindow = { gte: window.from, lt: window.to };
    const since7d = new Date(now.getTime() - 7 * DAY_MS);

    const [
      settings,
      welcomeMode,
      feedbackMode,
      feedbackSecondCallMode,
      purchaseMode,
      byKindStatus,
      alertDigests,
      events,
      suppressions,
      missing,
    ] = await Promise.all([
      this.settings.getForAdmin(),
      this.config.getEffectiveMode("WELCOME"),
      this.config.getEffectiveMode("FEEDBACK_FIRST_USE"),
      this.config.getEffectiveMode("FEEDBACK_SECOND_CALL"),
      this.config.getEffectiveMode("PURCHASE_CONFIRMATION"),
      this.database.emailDispatch.groupBy({
        by: ["kind", "status"],
        where: { isTest: false, createdAt: inWindow },
        _count: { _all: true },
      }),
      // Alerta de Vagas ainda não passa pelo outbox: vem do MonitorDigest.
      this.database.monitorDigest.groupBy({
        by: ["status"],
        where: { createdAt: inWindow },
        _count: { _all: true },
      }),
      this.database.emailDispatchEvent.groupBy({
        by: ["type"],
        where: { occurredAt: { gte: since7d } },
        _count: { _all: true },
      }),
      this.database.emailSuppression.groupBy({
        by: ["reason"],
        _count: { _all: true },
      }),
      this.recovery.findMissing(24, now),
    ]);

    const relationshipReady = this.config.checkSendReadiness();
    const purchaseReady = this.config.checkPurchaseSendReadiness();

    return {
      settings,
      runtime: {
        // Real só em produção; fora dela nada sai pela rede (fake).
        transport: this.config.isRealTransportAllowed()
          ? ("real" as const)
          : ("fake" as const),
        effectiveModes: {
          WELCOME: welcomeMode,
          FEEDBACK_FIRST_USE: feedbackMode,
          FEEDBACK_SECOND_CALL: feedbackSecondCallMode,
          PURCHASE_CONFIRMATION: purchaseMode,
        },
        // Só pronto/não pronto e o motivo — nunca nomes de lista/tópico/segredos.
        relationshipReadiness: relationshipReady.ready
          ? { ready: true as const }
          : { ready: false as const, reason: relationshipReady.reason },
        purchaseReadiness: purchaseReady.ready
          ? { ready: true as const }
          : { ready: false as const, reason: purchaseReady.reason },
      },
      counts: {
        window: {
          period: window.period,
          fromDate: window.fromDate,
          toDate: window.toDate,
        },
        byKindStatus: byKindStatus.map((row) => ({
          kind: row.kind,
          status: row.status,
          count: row._count._all,
        })),
        alertDigests: alertDigests.map((row) => ({
          status: row.status,
          count: row._count._all,
        })),
        eventsWindowDays: 7,
        events: events.map((row) => ({
          type: row.type,
          count: row._count._all,
        })),
        suppressions: suppressions.map((row) => ({
          reason: row.reason,
          count: row._count._all,
        })),
        missingPurchaseConfirmations: missing.length,
      },
    };
  }

  // ---- Configurações ------------------------------------------------------

  getSettings() {
    return this.settings.getForAdmin();
  }

  updateSettings(adminId: string, input: UpdateSettingsInput) {
    return this.settings.update(adminId, input);
  }

  // ---- Templates ----------------------------------------------------------

  listTemplates() {
    return this.templates.listForAdmin();
  }

  previewTemplate(key: EmailTemplateKeyValue, content: TemplateContent) {
    return this.templates.preview(key, content);
  }

  updateTemplate(
    adminId: string,
    key: EmailTemplateKeyValue,
    content: TemplateContent,
  ) {
    return this.templates.update(adminId, key, content);
  }

  resetTemplate(adminId: string, key: EmailTemplateKeyValue) {
    return this.templates.reset(adminId, key);
  }

  // Teste EXPLÍCITO de UM destinatário informado, com o template SALVO. O
  // transporte é real só em produção; fora dela é fake e a resposta diz isso
  // (a tela mostra "nada foi enviado"). Nunca varre a base.
  async sendTestTemplate(key: EmailTemplateKeyValue, recipientEmail: string) {
    const realTransport = this.config.isRealTransportAllowed();
    const user = await this.database.user.findUnique({
      where: { email: recipientEmail.trim().toLowerCase() },
      select: { name: true },
    });
    const name = user?.name ?? null;

    const common = { to: recipientEmail, name, realTransport };
    const result = await (() => {
      switch (key) {
        case "WELCOME":
          return this.dispatch.sendTest({ ...common, kind: "WELCOME" });
        case "FEEDBACK_FIRST_USE":
        case "FEEDBACK_SECOND_CALL":
          return this.dispatch.sendTest({ ...common, kind: key });
        case "PURCHASE_PAID":
          return this.dispatch.sendTest({
            ...common,
            kind: "PURCHASE_CONFIRMATION",
            payload: SAMPLE_PURCHASE_PAYLOAD,
          });
        case "PURCHASE_COUPON": {
          const payload: PurchaseConfirmationPayload = {
            ...SAMPLE_PURCHASE_PAYLOAD,
            planType: "starter",
            amountInCents: 0,
            credits: 3,
            analysisCredits: 3,
            isCouponRedemption: true,
          };
          return this.dispatch.sendTest({
            ...common,
            kind: "PURCHASE_CONFIRMATION",
            payload,
          });
        }
      }
    })();

    return {
      transport: realTransport ? ("real" as const) : ("fake" as const),
      ...(result.sent
        ? {
            sent: true as const,
            outcome: result.result.outcome,
            dispatchId: result.dispatchId,
          }
        : { sent: false as const, reason: result.reason }),
    };
  }

  // ---- Envios (Relacionamento / Compras) ----------------------------------

  async listDispatches(query: {
    page?: number;
    limit?: number;
    group?: "relationship" | "purchase";
    kind?: EmailDispatchKind;
    status?: EmailDispatchStatus;
    includeTest?: boolean;
  }) {
    const page = query.page ?? 1;
    const limit = query.limit ?? DEFAULT_PAGE_SIZE;

    const where: Prisma.EmailDispatchWhereInput = {
      ...(query.includeTest ? {} : { isTest: false }),
      ...(query.kind
        ? { kind: query.kind }
        : query.group === "relationship"
          ? { kind: { in: RELATIONSHIP_KINDS } }
          : query.group === "purchase"
            ? { kind: "PURCHASE_CONFIRMATION" }
            : {}),
      ...(query.status ? { status: query.status } : {}),
    };

    const [items, total] = await Promise.all([
      this.database.emailDispatch.findMany({
        where,
        orderBy: [{ createdAt: "desc" }],
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          kind: true,
          status: true,
          skippedReason: true,
          variant: true,
          recipientEmail: true,
          scheduledFor: true,
          sentAt: true,
          attempts: true,
          lastError: true,
          provider: true,
          isTest: true,
          referenceId: true,
          createdAt: true,
        },
      }),
      this.database.emailDispatch.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  async getDispatch(id: string) {
    const dispatch = await this.database.emailDispatch.findUnique({
      where: { id },
      select: {
        id: true,
        kind: true,
        status: true,
        skippedReason: true,
        variant: true,
        recipientEmail: true,
        scheduledFor: true,
        expiresAt: true,
        sentAt: true,
        attempts: true,
        lastError: true,
        provider: true,
        providerMessageId: true,
        isTest: true,
        referenceId: true,
        createdAt: true,
        events: {
          orderBy: [{ occurredAt: "asc" }],
          select: { id: true, type: true, occurredAt: true },
        },
      },
    });
    if (!dispatch) throw new NotFoundException("dispatch not found");
    return dispatch;
  }

  // ---- Supressões -----------------------------------------------------------

  async listSuppressions(pagination: { page?: number; limit?: number }) {
    const page = pagination.page ?? 1;
    const limit = pagination.limit ?? DEFAULT_PAGE_SIZE;
    const [items, total] = await Promise.all([
      this.database.emailSuppression.findMany({
        orderBy: [{ occurredAt: "desc" }],
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          email: true,
          reason: true,
          bounceSubType: true,
          sourceCategory: true,
          occurredAt: true,
        },
      }),
      this.database.emailSuppression.count(),
    ]);
    return { items, total, page, limit };
  }

  // ---- Compras: confirmações perdidas ----------------------------------------

  async missingPurchaseConfirmations(sinceHours = 24) {
    const missing = await this.recovery.findMissing(sinceHours);
    return { sinceHours, count: missing.length, items: missing };
  }

  recoverPurchaseConfirmations(sinceHours?: number) {
    return this.recovery.recover({ sinceHours, apply: true });
  }
}
