import "reflect-metadata";

import assert from "node:assert/strict";
import { test } from "node:test";

import { BadRequestException } from "@nestjs/common";

import {
  AdminMockInterviewsService,
  computeRefundEligibility,
} from "./admin-mock-interviews.service";

const NOW = new Date("2026-10-10T12:00:00.000Z");
const HOUR = 60 * 60_000;

type Row = Record<string, unknown>;

function createService(
  purchase: Row,
  options: {
    inviteResult?: { status: "sent" | "failed"; error: string | null };
    priorEvents?: Row[];
  } = {},
) {
  const row: Row = { ...purchase };
  const createdEvents: Row[] = [];
  const invites: { id: string; kind: string }[] = [];
  const priorEvents = options.priorEvents ?? [];
  const db = {
    mockInterviewPurchase: {
      findUnique: async (args: { include?: unknown }) =>
        args.include
          ? {
              ...row,
              user: { id: "user-1", name: "Maria", email: "maria@example.com" },
              events: [],
            }
          : { ...row },
      update: async ({ data }: { data: Row }) => {
        const { events, rescheduleCount, ...rest } = data as {
          events?: { createMany: { data: Row[] } };
          rescheduleCount?: { increment: number };
        } & Row;
        Object.assign(row, rest);
        if (rescheduleCount) {
          row.rescheduleCount =
            (row.rescheduleCount as number) + rescheduleCount.increment;
        }
        createdEvents.push(...(events?.createMany.data ?? []));
        return row;
      },
    },
    mockInterviewEvent: {
      findFirst: async ({ where }: { where: Row }) =>
        [...priorEvents, ...createdEvents].find((e) => e.type === where.type) ??
        null,
      create: async ({ data }: { data: Row }) => {
        createdEvents.push(data);
        return data;
      },
    },
    jobApplication: { findUnique: async () => null },
  };
  const notifications = {
    sendScheduleInvite: async (id: string, kind: string) => {
      invites.push({ id, kind });
      return options.inviteResult ?? { status: "sent" as const, error: null };
    },
  };
  return {
    service: new AdminMockInterviewsService(db as never, notifications),
    row,
    createdEvents,
    invites,
  };
}

function paid(overrides: Row = {}): Row {
  return {
    id: "cmpurchase000abc123",
    userId: "user-1",
    amountInCents: 7990,
    currency: "BRL",
    paymentStatus: "completed",
    paymentMethod: "pix",
    mpPaymentId: "pay-1",
    paidAt: new Date("2026-10-01T12:00:00.000Z"),
    refundedAt: null,
    origin: "landing",
    originJobApplicationId: null,
    policyVersion: "2026-10-01",
    policyAcceptedAt: new Date("2026-10-01T11:59:00.000Z"),
    sessionStatus: "AWAITING_SCHEDULING",
    scheduledAt: null,
    meetingUrl: null,
    completedAt: null,
    reportSentAt: null,
    rescheduleCount: 0,
    adminNotes: null,
    adminNotifiedAt: null,
    adminNotifyError: null,
    buyerNotifiedAt: null,
    buyerNotifyError: null,
    createdAt: new Date("2026-10-01T11:59:00.000Z"),
    ...overrides,
  };
}

test("refund eligibility: any time before scheduling, until 24h before the session, never after it ends", () => {
  const base = {
    paymentStatus: "completed" as const,
    sessionStatus: "AWAITING_SCHEDULING" as const,
    scheduledAt: null,
  };
  assert.equal(computeRefundEligibility(base, NOW).eligible, true);

  const scheduled = { ...base, sessionStatus: "SCHEDULED" as const };
  assert.equal(
    computeRefundEligibility(
      { ...scheduled, scheduledAt: new Date(NOW.getTime() + 25 * HOUR) },
      NOW,
    ).eligible,
    true,
  );
  assert.equal(
    computeRefundEligibility(
      { ...scheduled, scheduledAt: new Date(NOW.getTime() + 24 * HOUR) },
      NOW,
    ).eligible,
    true,
  );
  assert.equal(
    computeRefundEligibility(
      { ...scheduled, scheduledAt: new Date(NOW.getTime() + 23 * HOUR) },
      NOW,
    ).eligible,
    false,
  );
  assert.equal(
    computeRefundEligibility(
      { ...base, sessionStatus: "NO_SHOW" as const },
      NOW,
    ).eligible,
    false,
  );
  assert.equal(
    computeRefundEligibility(
      { ...base, paymentStatus: "pending" as const },
      NOW,
    ).eligible,
    false,
  );
});

test("scheduling a paid purchase moves it to SCHEDULED and records both events", async () => {
  const { service, row, createdEvents } = createService(paid());
  const when = new Date(NOW.getTime() + 3 * 24 * HOUR).toISOString();
  await service.update(
    "cmpurchase000abc123",
    "admin-1",
    { scheduledAt: when },
    NOW,
  );

  assert.equal((row.scheduledAt as Date).toISOString(), when);
  assert.equal(row.sessionStatus, "SCHEDULED");
  assert.deepEqual(
    createdEvents.map((e) => e.type),
    ["scheduled", "session_status_changed"],
  );
  assert.equal(createdEvents[0]?.actor, "admin:admin-1");
});

test("rescheduling counts and flags a change made with less than 24h notice", async () => {
  const original = new Date(NOW.getTime() + 10 * HOUR);
  const { service, row, createdEvents } = createService(
    paid({ sessionStatus: "SCHEDULED", scheduledAt: original }),
  );
  await service.update(
    "cmpurchase000abc123",
    "admin-1",
    { scheduledAt: new Date(NOW.getTime() + 48 * HOUR).toISOString() },
    NOW,
  );
  assert.equal(row.rescheduleCount, 1);
  assert.equal(createdEvents[0]?.type, "rescheduled");
  assert.match(String(createdEvents[0]?.note), /menos de 24h/);
});

test("completing the session stamps completedAt; marking the report as sent is recorded", async () => {
  const { service, row, createdEvents } = createService(
    paid({
      sessionStatus: "SCHEDULED",
      scheduledAt: new Date(NOW.getTime() - HOUR),
    }),
  );
  await service.update(
    "cmpurchase000abc123",
    "admin-1",
    { sessionStatus: "COMPLETED", reportSent: true },
    NOW,
  );
  assert.equal(row.sessionStatus, "COMPLETED");
  assert.equal((row.completedAt as Date).getTime(), NOW.getTime());
  assert.equal((row.reportSentAt as Date).getTime(), NOW.getTime());
  assert.deepEqual(
    createdEvents.map((e) => e.type),
    ["session_status_changed", "report_sent"],
  );
});

test("unpaid purchases cannot be scheduled; REFUNDED is never set by hand; SCHEDULED needs a date", async () => {
  await assert.rejects(
    createService(paid({ paymentStatus: "pending" })).service.update(
      "cmpurchase000abc123",
      "admin-1",
      { scheduledAt: NOW.toISOString() },
      NOW,
    ),
    BadRequestException,
  );
  await assert.rejects(
    createService(paid()).service.update(
      "cmpurchase000abc123",
      "admin-1",
      { sessionStatus: "REFUNDED" },
      NOW,
    ),
    BadRequestException,
  );
  await assert.rejects(
    createService(paid()).service.update(
      "cmpurchase000abc123",
      "admin-1",
      { sessionStatus: "SCHEDULED" },
      NOW,
    ),
    BadRequestException,
  );
  await assert.rejects(
    createService(paid()).service.update(
      "cmpurchase000abc123",
      "admin-1",
      { meetingUrl: "http://meet.google.com/abc" },
      NOW,
    ),
    BadRequestException,
  );
});

const MEET = "https://meet.google.com/abc-defg-hij";

test("invite: scheduling with date and link emails the buyer and records it", async () => {
  const { service, invites, createdEvents } = createService(paid());
  const result = await service.update(
    "cmpurchase000abc123",
    "admin-1",
    {
      scheduledAt: new Date(NOW.getTime() + 3 * 24 * HOUR).toISOString(),
      meetingUrl: MEET,
    },
    NOW,
  );
  assert.deepEqual(result.invite, { status: "sent" });
  assert.deepEqual(invites, [{ id: "cmpurchase000abc123", kind: "scheduled" }]);
  const event = createdEvents.find((e) => e.type === "invite_sent");
  assert.equal(event?.note, "scheduled");
});

test("invite: no link means no email and the admin is told; past dates are not invited", async () => {
  const a = createService(paid());
  const noLink = await a.service.update(
    "cmpurchase000abc123",
    "admin-1",
    { scheduledAt: new Date(NOW.getTime() + 3 * 24 * HOUR).toISOString() },
    NOW,
  );
  assert.deepEqual(noLink.invite, { status: "skipped_missing_link" });
  assert.equal(a.invites.length, 0);

  const b = createService(paid());
  const past = await b.service.update(
    "cmpurchase000abc123",
    "admin-1",
    {
      scheduledAt: new Date(NOW.getTime() - HOUR).toISOString(),
      meetingUrl: MEET,
    },
    NOW,
  );
  assert.deepEqual(past.invite, { status: "skipped_past" });
  assert.equal(b.invites.length, 0);
});

test("invite: reschedule and link change resend with the right wording; notes alone do not", async () => {
  const when = new Date(NOW.getTime() + 3 * 24 * HOUR);
  const scheduled = paid({
    sessionStatus: "SCHEDULED",
    scheduledAt: when,
    meetingUrl: MEET,
  });
  const invited = [{ type: "invite_sent" }];

  const r = createService(scheduled, { priorEvents: invited });
  await r.service.update(
    "cmpurchase000abc123",
    "admin-1",
    { scheduledAt: new Date(when.getTime() + 24 * HOUR).toISOString() },
    NOW,
  );
  assert.equal(r.invites[0]?.kind, "rescheduled");

  const u = createService(scheduled, { priorEvents: invited });
  await u.service.update(
    "cmpurchase000abc123",
    "admin-1",
    { meetingUrl: "https://meet.google.com/new-link-xyz" },
    NOW,
  );
  assert.equal(u.invites[0]?.kind, "updated");

  const n = createService(scheduled, { priorEvents: invited });
  const notes = await n.service.update(
    "cmpurchase000abc123",
    "admin-1",
    { adminNotes: "trazer a vaga" },
    NOW,
  );
  assert.equal(notes.invite, null);
  assert.equal(n.invites.length, 0);
});

test("invite: a provider failure is returned to the admin and recorded, the save still stands", async () => {
  const { service, row, createdEvents } = createService(paid(), {
    inviteResult: { status: "failed", error: "AccessDenied" },
  });
  const result = await service.update(
    "cmpurchase000abc123",
    "admin-1",
    {
      scheduledAt: new Date(NOW.getTime() + 3 * 24 * HOUR).toISOString(),
      meetingUrl: MEET,
    },
    NOW,
  );
  assert.deepEqual(result.invite, { status: "failed", error: "AccessDenied" });
  assert.equal(row.sessionStatus, "SCHEDULED");
  assert.equal(
    createdEvents.find((e) => e.type === "invite_failed")?.note,
    "AccessDenied",
  );
});

test("invite resend: only for paid, scheduled future sessions with a link", async () => {
  const when = new Date(NOW.getTime() + 3 * 24 * HOUR);
  const ok = createService(
    paid({ sessionStatus: "SCHEDULED", scheduledAt: when, meetingUrl: MEET }),
  );
  const result = await ok.service.resendInvite("cmpurchase000abc123", NOW);
  assert.deepEqual(result.invite, { status: "sent" });
  assert.equal(ok.invites[0]?.kind, "scheduled");

  const noLink = createService(
    paid({ sessionStatus: "SCHEDULED", scheduledAt: when }),
  );
  await assert.rejects(
    noLink.service.resendInvite("cmpurchase000abc123", NOW),
    BadRequestException,
  );
  const waiting = createService(paid());
  await assert.rejects(
    waiting.service.resendInvite("cmpurchase000abc123", NOW),
    BadRequestException,
  );
});
