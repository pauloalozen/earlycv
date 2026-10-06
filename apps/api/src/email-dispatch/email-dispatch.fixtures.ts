// Fixture compartilhada das specs do dispatch — monta service/worker/
// eligibility reais sobre o banco em memória. NÃO é código de produção.
import type { EmailSendResult } from "../email/email.types";
import { EmailDispatchService } from "./email-dispatch.service";
import {
  createConfig,
  createTable,
  type Row,
} from "./email-dispatch.test-support";
import { EmailDispatchWorker } from "./email-dispatch.worker";
import { EmailDispatchEligibilityService } from "./email-dispatch-eligibility.service";
import { EmailDispatchTemplateService } from "./email-dispatch-template.service";

export const NOW = new Date("2026-10-05T15:00:00.000Z"); // 12:00 BRT, dentro da janela
export const AFTER_CUTOFF = new Date("2026-10-04T10:00:00.000Z");

export function baseUser(overrides: Row = {}): Row {
  return {
    id: "user_1",
    email: "maria@example.com",
    name: "Maria Souza",
    status: "active",
    emailVerifiedAt: new Date("2026-10-04T10:05:00.000Z"),
    createdAt: AFTER_CUTOFF,
    isStaff: false,
    internalRole: "none",
    relationshipEmailPreference: null,
    monitorAlertPreference: null,
    productEmailSubscription: null,
    ...overrides,
  };
}

export function createFixture(
  options: {
    env?: Parameters<typeof createConfig>[0];
    production?: boolean;
    users?: Row[];
    sendResults?: Array<EmailSendResult | (() => never)>;
    purchases?: Row[];
  } = {},
) {
  const emailDispatch = createTable({ uniqueKeys: ["dedupeKey"] });
  const emailSuppression = createTable({ uniqueKeys: ["email"] });
  const emailDispatchTemplate = createTable({ uniqueKeys: ["key"] });
  const users = options.users ?? [baseUser()];
  const sent: Array<{ category: string; message: Row }> = [];
  const sendResults = [...(options.sendResults ?? [])];
  let lockAcquisitions = 0;

  const database = {
    emailDispatch,
    emailSuppression,
    emailDispatchTemplate,
    user: {
      findUnique: async ({ where }: { where: Row }) =>
        users.find((u) =>
          where.id ? u.id === where.id : u.email === where.email,
        ) ?? null,
    },
    planPurchase: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        (options.purchases ?? []).find((p) => p.id === where.id) ?? null,
    },
    // biome-ignore lint/suspicious/noExplicitAny: fake mínimo pro teste
  } as any;

  const config = createConfig(options.env, { production: options.production });

  const emailService = {
    send: async (params: { category: string; message: Row }) => {
      sent.push(params);
      const next = sendResults.shift();
      if (typeof next === "function") return next();
      return (
        next ?? {
          outcome: "SENT" as const,
          provider: "SES" as const,
          providerMessageId: `ses-msg-${sent.length}`,
        }
      );
    },
    // biome-ignore lint/suspicious/noExplicitAny: fake mínimo pro teste
  } as any;

  const suppression = {
    findByEmail: async (email: string) => {
      const row = await emailSuppression.findUnique({
        where: { email: email.toLowerCase() },
      });
      return row ? { reason: row.reason } : null;
    },
  };

  const templates = new EmailDispatchTemplateService(database);
  const service = new EmailDispatchService(
    database,
    config,
    emailService,
    suppression,
    templates,
  );
  const eligibility = new EmailDispatchEligibilityService(
    database,
    config,
    suppression,
  );
  const lock = {
    acquire: async () => {
      lockAcquisitions += 1;
      return true;
    },
    release: async () => {},
    // biome-ignore lint/suspicious/noExplicitAny: fake mínimo pro teste
  } as any;
  const worker = new EmailDispatchWorker(
    database,
    lock,
    config,
    eligibility,
    service,
  );

  const addDispatch = (overrides: Row = {}) =>
    emailDispatch.create({
      data: {
        kind: "WELCOME",
        userId: "user_1",
        recipientEmail: "maria@example.com",
        dedupeKey: `welcome:${overrides.userId ?? "user_1"}`,
        status: "PENDING",
        scheduledFor: new Date(NOW.getTime() - 60_000),
        expiresAt: new Date(NOW.getTime() + 24 * 3_600_000),
        isTest: false,
        ...overrides,
      },
    });

  return {
    database,
    config,
    service,
    eligibility,
    worker,
    emailDispatch,
    emailSuppression,
    emailDispatchTemplate,
    templates,
    users,
    sent,
    addDispatch,
    lockAcquisitions: () => lockAcquisitions,
  };
}
