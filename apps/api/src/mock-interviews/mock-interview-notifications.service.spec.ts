import "reflect-metadata";

import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import {
  buildAdminSaleEmail,
  buildBuyerConfirmationEmail,
  MockInterviewNotificationsService,
} from "./mock-interview-notifications.service";

type Row = Record<string, unknown>;

function setup(
  purchase: Row,
  outcome: "SENT" | "FAILED" | "OUTCOME_UNKNOWN" = "SENT",
) {
  const row: Row = { ...purchase };
  const sent: {
    category: string;
    to: string;
    subject: string;
    key?: string;
  }[] = [];
  const matches = (where: Record<string, unknown>) =>
    Object.entries(where).every(([key, condition]) => {
      if (key === "OR") {
        return (condition as Record<string, unknown>[]).some((alt) =>
          Object.entries(alt).every(([k, c]) =>
            c && typeof c === "object" && "lt" in c
              ? row[k] instanceof Date &&
                (row[k] as Date) < (c as { lt: Date }).lt
              : row[k] === c,
          ),
        );
      }
      return row[key] === condition;
    });
  const db = {
    mockInterviewPurchase: {
      updateMany: async ({ where, data }: { where: Row; data: Row }) => {
        if (!matches(where)) return { count: 0 };
        Object.assign(row, data);
        return { count: 1 };
      },
      findUnique: async () => ({
        ...row,
        user: { name: "Maria Souza", email: "maria@example.com" },
      }),
      update: async ({ data }: { data: Row }) => Object.assign(row, data),
    },
    jobApplication: { findUnique: async () => null },
  };
  const emailService = {
    send: async ({
      category,
      message,
    }: {
      category: string;
      message: { to: string; subject: string; idempotencyKey?: string };
    }) => {
      sent.push({
        category,
        to: message.to,
        subject: message.subject,
        key: message.idempotencyKey,
      });
      return {
        outcome,
        provider: "RESEND" as const,
        errorMessage: outcome === "SENT" ? undefined : "boom",
      };
    },
  };
  return {
    service: new MockInterviewNotificationsService(
      db as never,
      emailService as never,
    ),
    row,
    sent,
  };
}

const paidPurchase = {
  id: "cmpurchase000abc123",
  paymentStatus: "completed",
  amountInCents: 7990,
  currency: "BRL",
  paymentMethod: "pix",
  origin: "landing",
  originJobApplicationId: null,
  adminNotifyClaimedAt: null,
  adminNotifiedAt: null,
  buyerNotifyClaimedAt: null,
  buyerNotifiedAt: null,
};

const savedEnv = { ...process.env };
beforeEach(() => {
  process.env.MOCK_INTERVIEW_ADMIN_EMAIL = "Paulo.Alozen@gmail.com";
});
afterEach(() => {
  process.env = { ...savedEnv };
});

test("approval sends the sale notice to the admin and the receipt to the buyer, once each (BILLING)", async () => {
  const { service, row, sent } = setup(paidPurchase);
  await service.notifyPurchaseApproved("cmpurchase000abc123");
  await service.notifyPurchaseApproved("cmpurchase000abc123");

  assert.deepEqual(
    sent.map((s) => [s.category, s.to, s.key]),
    [
      [
        "BILLING",
        "paulo.alozen@gmail.com",
        "mock-interview-admin:cmpurchase000abc123",
      ],
      [
        "BILLING",
        "maria@example.com",
        "mock-interview-buyer:cmpurchase000abc123",
      ],
    ],
  );
  assert.ok(row.adminNotifiedAt instanceof Date);
  assert.ok(row.buyerNotifiedAt instanceof Date);
});

test("a confirmed provider failure releases the claim so the retry job can send it later", async () => {
  const { service, row } = setup(paidPurchase, "FAILED");
  await service.notifyPurchaseApproved("cmpurchase000abc123");
  assert.equal(row.adminNotifiedAt, null);
  assert.equal(row.adminNotifyClaimedAt, null);
  assert.equal(row.adminNotifyError, "boom");
});

test("an unpaid purchase never triggers the e-mails", async () => {
  const { service, sent } = setup({
    ...paidPurchase,
    paymentStatus: "pending",
  });
  await service.notifyPurchaseApproved("cmpurchase000abc123");
  assert.equal(sent.length, 0);
});

test("without MOCK_INTERVIEW_ADMIN_EMAIL the admin notice is recorded as an error, the buyer still gets the receipt", async () => {
  delete process.env.MOCK_INTERVIEW_ADMIN_EMAIL;
  const { service, row, sent } = setup(paidPurchase);
  await service.notifyPurchaseApproved("cmpurchase000abc123");
  assert.deepEqual(
    sent.map((s) => s.to),
    ["maria@example.com"],
  );
  assert.match(String(row.adminNotifyError), /MOCK_INTERVIEW_ADMIN_EMAIL/);
});

test("e-mail contents: admin gets buyer and order code; buyer gets the order link and the policy", () => {
  const admin = buildAdminSaleEmail({
    purchaseId: "cmpurchase000abc123",
    buyerName: "Maria Souza",
    buyerEmail: "maria@example.com",
    amountInCents: 7990,
    currency: "BRL",
    paymentMethod: "pix",
    origin: "application_offer",
    application: { jobTitle: "Analista de Dados", companyName: "Nubank" },
  });
  assert.match(admin.subject, /#ABC123/);
  assert.match(admin.text, /maria@example\.com/);
  assert.match(admin.text, /Analista de Dados · Nubank/);
  assert.match(admin.text, /\/admin\/simulados\/cmpurchase000abc123/);

  const buyer = buildBuyerConfirmationEmail({
    purchaseId: "cmpurchase000abc123",
    buyerName: "Maria Souza",
    amountInCents: 7990,
    currency: "BRL",
  });
  assert.match(buyer.text, /Oi, Maria!/);
  assert.match(
    buyer.text,
    /\/simulacao-de-entrevista\/pedido\/cmpurchase000abc123/,
  );
  assert.match(buyer.text, /24 horas antes/);
  assert.match(buyer.text, /Google Meet/);
  // O número do WhatsApp nunca vai no e-mail (só na página do pedido).
  assert.doesNotMatch(buyer.text, /wa\.me/);
});

test("schedule invite: São Paulo time, call link, Google Calendar link and reschedule rule", async () => {
  const { buildScheduleInviteEmail } = await import(
    "./mock-interview-notifications.service"
  );
  const email = buildScheduleInviteEmail({
    purchaseId: "cmpurchase000abc123",
    buyerName: "Maria Souza",
    // 22:00 UTC = 19:00 em Brasília
    scheduledAt: new Date("2026-10-20T22:00:00.000Z"),
    meetingUrl: "https://meet.google.com/abc-defg-hij",
    kind: "scheduled",
  });
  assert.match(email.subject, /marcada/);
  assert.match(email.text, /Oi, Maria!/);
  assert.match(email.text, /19:00/);
  assert.match(email.text, /https:\/\/meet\.google\.com\/abc-defg-hij/);
  assert.match(
    email.text,
    /calendar\.google\.com\/calendar\/render\?action=TEMPLATE/,
  );
  assert.match(email.text, /dates=20261020T220000Z%2F20261020T224500Z/);
  assert.match(email.text, /24 horas de antecedência/);
  assert.match(email.html, /Entrar na chamada/);

  const moved = buildScheduleInviteEmail({
    purchaseId: "cmpurchase000abc123",
    buyerName: "",
    scheduledAt: new Date("2026-10-21T22:00:00.000Z"),
    meetingUrl: "https://meet.google.com/abc-defg-hij",
    kind: "rescheduled",
  });
  assert.match(moved.subject, /remarcada/);
  assert.match(moved.text, /^Oi!/);
});
