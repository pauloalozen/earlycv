import "reflect-metadata";

import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import {
  HOUR_MS,
  MOCK_INTERVIEW_OFFER_DELAY_MS,
} from "./email-dispatch.constants";
import { EmailDispatchService } from "./email-dispatch.service";
import { EmailDispatchEligibilityService } from "./email-dispatch-eligibility.service";
import {
  renderMockInterviewOfferEmail,
  TEMPLATE_DEFINITIONS,
  validateTemplate,
} from "./email-dispatch-templates";

// A oferta só existe com a venda aberta ao público (MOCK_INTERVIEW_MODE=on).
const savedMode = process.env.MOCK_INTERVIEW_MODE;
beforeEach(() => {
  process.env.MOCK_INTERVIEW_MODE = "on";
});
afterEach(() => {
  if (savedMode === undefined) delete process.env.MOCK_INTERVIEW_MODE;
  else process.env.MOCK_INTERVIEW_MODE = savedMode;
});

const NOW = new Date("2026-10-10T12:00:00.000Z");
const START_AT = new Date("2026-10-01T00:00:00.000Z");

function config(mode: "OFF" | "LIVE" = "LIVE") {
  return {
    getEffectiveMode: async () => mode,
    getStartAt: async () => START_AT,
    isBlocked: async () => false,
  };
}

const activeUser = {
  id: "user-1",
  email: "maria@example.com",
  name: "Maria Souza",
  status: "active",
  emailVerifiedAt: new Date("2020-01-01"),
  // Cadastro ANTES do cutoff: a oferta vale para a base inteira.
  createdAt: new Date("2025-01-01"),
  isStaff: false,
  internalRole: "none",
  relationshipEmailPreference: null,
  monitorAlertPreference: null,
  productEmailSubscription: null,
};

function eligibility(opts: {
  purchased?: boolean;
  recentOffer?: boolean;
  applicationExists?: boolean;
  user?: Record<string, unknown>;
}) {
  return new EmailDispatchEligibilityService(
    {
      mockInterviewPurchase: {
        findFirst: async () => (opts.purchased ? { id: "p1" } : null),
      },
      emailDispatch: {
        findFirst: async () => (opts.recentOffer ? { id: "d0" } : null),
      },
      jobApplication: {
        findFirst: async () =>
          opts.applicationExists === false ? null : { id: "app-1" },
      },
      user: { findUnique: async () => ({ ...activeUser, ...opts.user }) },
    } as never,
    config() as never,
    { findByEmail: async () => null },
  );
}

const offerRow = {
  id: "d1",
  userId: "user-1",
  referenceId: "app-1",
  scheduledFor: new Date(NOW.getTime() - 10 * 60_000),
};

test("offer is eligible for an existing user who signed up before the relationship cutoff", async () => {
  const verdict = await eligibility({}).evaluateMockInterviewOffer(
    offerRow,
    NOW,
  );
  assert.equal(verdict.eligible, true);
});

test("offer is skipped when the sale is off or admin-only (flag changed after enqueue)", async () => {
  for (const mode of ["off", "admin", "", "garbage"]) {
    process.env.MOCK_INTERVIEW_MODE = mode;
    assert.deepEqual(
      await eligibility({}).evaluateMockInterviewOffer(offerRow, NOW),
      { eligible: false, reason: "mock_interview_disabled" },
    );
  }
});

test("offer is skipped when the user bought after the offer, got another offer in 7 days or the application is gone", async () => {
  assert.deepEqual(
    await eligibility({ purchased: true }).evaluateMockInterviewOffer(
      offerRow,
      NOW,
    ),
    { eligible: false, reason: "already_purchased" },
  );
  assert.deepEqual(
    await eligibility({ recentOffer: true }).evaluateMockInterviewOffer(
      offerRow,
      NOW,
    ),
    { eligible: false, reason: "offer_cooldown" },
  );
  assert.deepEqual(
    await eligibility({ applicationExists: false }).evaluateMockInterviewOffer(
      offerRow,
      NOW,
    ),
    { eligible: false, reason: "application_not_found" },
  );
});

test("offer still respects relationship rules: unsubscribed, unverified and staff never receive it", async () => {
  for (const [user, reason] of [
    [
      { relationshipEmailPreference: { subscribed: false } },
      "relationship_unsubscribed",
    ],
    [{ emailVerifiedAt: null }, "email_unverified"],
    [{ isStaff: true }, "staff_user"],
  ] as const) {
    const verdict = await eligibility({ user }).evaluateMockInterviewOffer(
      offerRow,
      NOW,
    );
    assert.deepEqual(verdict, { eligible: false, reason });
  }
});

test("offer created before the activation cutoff is never sent", async () => {
  const verdict = await eligibility({}).evaluateMockInterviewOffer(
    {
      ...offerRow,
      scheduledFor: new Date(
        START_AT.getTime() + MOCK_INTERVIEW_OFFER_DELAY_MS - 1,
      ),
    },
    NOW,
  );
  assert.deepEqual(verdict, { eligible: false, reason: "before_cutoff" });
});

function dispatchService(opts: {
  mode?: "OFF" | "LIVE";
  recentOffer?: boolean;
}) {
  const created: Record<string, unknown>[] = [];
  const service = new EmailDispatchService(
    {
      user: { findUnique: async () => ({ email: "maria@example.com" }) },
      emailDispatch: {
        findFirst: async () => (opts.recentOffer ? { id: "d0" } : null),
        createMany: async ({ data }: { data: Record<string, unknown>[] }) => {
          created.push(...data);
          return { count: data.length };
        },
      },
    } as never,
    config(opts.mode) as never,
    {} as never,
    { findByEmail: async () => null },
    {
      getEffective: async () =>
        TEMPLATE_DEFINITIONS.MOCK_INTERVIEW_OFFER.defaults,
    },
  );
  return { service, created };
}

const enqueueInput = {
  userId: "user-1",
  jobApplicationId: "app-1",
  jobTitle: "Analista de Dados",
  companyName: "Nubank",
  amountInCents: 7990,
  currency: "BRL",
};

test("enqueue schedules the offer 2h later, deduped per application", async () => {
  const { service, created } = dispatchService({});
  assert.equal(
    await service.enqueueMockInterviewOffer(enqueueInput, NOW),
    true,
  );
  assert.equal(created.length, 1);
  assert.equal(created[0]?.kind, "MOCK_INTERVIEW_OFFER");
  assert.equal(created[0]?.dedupeKey, "mockoffer:app-1");
  assert.equal(
    (created[0]?.scheduledFor as Date).getTime(),
    NOW.getTime() + 2 * HOUR_MS,
  );
});

test("enqueue does nothing with the mode OFF or while another offer is pending/recent", async () => {
  const off = dispatchService({ mode: "OFF" });
  assert.equal(
    await off.service.enqueueMockInterviewOffer(enqueueInput, NOW),
    false,
  );
  assert.equal(off.created.length, 0);

  const recent = dispatchService({ recentOffer: true });
  assert.equal(
    await recent.service.enqueueMockInterviewOffer(enqueueInput, NOW),
    false,
  );
  assert.equal(recent.created.length, 0);
});

test("offer e-mail renders job, price and link; the template requires the link", () => {
  const rendered = renderMockInterviewOfferEmail({
    name: "Maria Souza",
    appUrl: "https://earlycv.com.br/",
    payload: {
      jobApplicationId: "app-1",
      jobTitle: "Analista de Dados",
      companyName: "Nubank",
      amountInCents: 7990,
      currency: "BRL",
    },
  });
  assert.match(rendered.text, /Oi, Maria!/);
  assert.match(rendered.text, /Analista de Dados na Nubank/);
  assert.match(rendered.text, /R\$\s?79,90/);
  assert.match(
    rendered.text,
    /https:\/\/earlycv\.com\.br\/simulacao-de-entrevista\?origem=email&candidatura=app-1/,
  );
  // Relacionamento: sempre com o rodapé de descadastro do SES.
  assert.match(rendered.text, /amazonSESUnsubscribeUrl/);

  assert.deepEqual(
    validateTemplate(
      "MOCK_INTERVIEW_OFFER",
      TEMPLATE_DEFINITIONS.MOCK_INTERVIEW_OFFER.defaults,
    ),
    [],
  );
  assert.ok(
    validateTemplate("MOCK_INTERVIEW_OFFER", {
      subject: "Oi",
      body: "{{saudacao}} sem link",
    }).some((e) => e.includes("{{link}}")),
  );
});
