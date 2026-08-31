import assert from "node:assert/strict";
import { test } from "node:test";

import { Prisma } from "@prisma/client";

import { MonitorDigestWebhookService } from "./monitor-digest-webhook.service";

function createFixture() {
  const events = new Map<
    string,
    { providerEventId: string; digestId: string | null; type: string }
  >();
  const digests = new Map<
    string,
    { id: string; userId: string; providerMessageId: string }
  >();
  const preferenceUpdates: { userId: string; data: Record<string, unknown> }[] =
    [];
  const recordedEvents: {
    eventName: string;
    userId: string | null;
    metadata: Record<string, unknown>;
  }[] = [];

  const database = {
    monitorDigest: {
      findFirst: async ({ where }: { where: { providerMessageId: string } }) =>
        Array.from(digests.values()).find(
          (d) => d.providerMessageId === where.providerMessageId,
        ) ?? null,
    },
    monitorDigestEvent: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const providerEventId = data.providerEventId as string;
        if (events.has(providerEventId)) {
          throw new Prisma.PrismaClientKnownRequestError("unique constraint", {
            code: "P2002",
            clientVersion: "6.19.3",
          });
        }
        const record = {
          providerEventId,
          digestId: (data.digestId as string | null) ?? null,
          type: data.type as string,
        };
        events.set(providerEventId, record);
        return record;
      },
    },
    monitorAlertPreference: {
      updateMany: async ({
        where,
        data,
      }: {
        where: { userId: string };
        data: Record<string, unknown>;
      }) => {
        preferenceUpdates.push({ userId: where.userId, data });
        return { count: 1 };
      },
    },
  };

  const funnelEvents = {
    record: async (
      input: { eventName: string; metadata?: Record<string, unknown> },
      context: { userId: string | null },
    ) => {
      recordedEvents.push({
        eventName: input.eventName,
        userId: context.userId,
        metadata: input.metadata ?? {},
      });
      return { event: null, ingested: true };
    },
  };

  const entitlementService = {
    canUseMonitor: async () => ({ allowed: true, reason: "launch_access" }),
  };

  const service = new MonitorDigestWebhookService(
    database as never,
    funnelEvents as never,
    entitlementService as never,
  );

  return {
    database,
    digests,
    events,
    preferenceUpdates,
    recordedEvents,
    service,
    seedDigest(id: string, userId: string, providerMessageId: string) {
      digests.set(id, { id, userId, providerMessageId });
    },
  };
}

test("a valid delivered webhook creates a MonitorDigestEvent and records monitor_digest_delivered", async () => {
  const fixture = createFixture();
  fixture.seedDigest("digest-1", "user-1", "email_abc");

  const result = await fixture.service.processEvent("svix-1", {
    type: "email.delivered",
    data: { email_id: "email_abc" },
  });

  assert.equal(result.processed, true);
  assert.deepEqual(
    fixture.recordedEvents.map((e) => e.eventName),
    ["monitor_digest_delivered"],
  );
  assert.equal(fixture.recordedEvents[0].userId, "user-1");
});

test("the same webhook delivered twice (same svix-id) is processed only once — idempotent", async () => {
  const fixture = createFixture();
  fixture.seedDigest("digest-1", "user-1", "email_abc");

  const first = await fixture.service.processEvent("svix-1", {
    type: "email.delivered",
    data: { email_id: "email_abc" },
  });
  const second = await fixture.service.processEvent("svix-1", {
    type: "email.delivered",
    data: { email_id: "email_abc" },
  });

  assert.equal(first.processed, true);
  assert.equal(second.processed, false);
  assert.equal(second.reason, "duplicate");
  assert.equal(fixture.recordedEvents.length, 1);
});

test("an unsupported event type is rejected without creating an event or recording anything", async () => {
  const fixture = createFixture();
  fixture.seedDigest("digest-1", "user-1", "email_abc");

  const result = await fixture.service.processEvent("svix-1", {
    type: "email.sent",
    data: { email_id: "email_abc" },
  });

  assert.equal(result.processed, false);
  assert.equal(result.reason, "unsupported_type");
  assert.equal(fixture.events.size, 0);
  assert.equal(fixture.recordedEvents.length, 0);
});

test("bounced marks the user's MonitorAlertPreference emailEnabled=false and records monitor_digest_bounced", async () => {
  const fixture = createFixture();
  fixture.seedDigest("digest-1", "user-1", "email_abc");

  const result = await fixture.service.processEvent("svix-1", {
    type: "email.bounced",
    data: { email_id: "email_abc" },
  });

  assert.equal(result.processed, true);
  assert.deepEqual(fixture.preferenceUpdates, [
    {
      userId: "user-1",
      data: {
        emailEnabled: false,
        unsubscribedAt: fixture.preferenceUpdates[0].data.unsubscribedAt,
      },
    },
  ]);
  assert.ok(fixture.preferenceUpdates[0].data.unsubscribedAt instanceof Date);
  assert.deepEqual(
    fixture.recordedEvents.map((e) => e.eventName),
    ["monitor_digest_bounced"],
  );
});

test("complained marks the user's MonitorAlertPreference emailEnabled=false and records monitor_digest_complained", async () => {
  const fixture = createFixture();
  fixture.seedDigest("digest-1", "user-1", "email_abc");

  await fixture.service.processEvent("svix-1", {
    type: "email.complained",
    data: { email_id: "email_abc" },
  });

  assert.equal(fixture.preferenceUpdates.length, 1);
  assert.equal(fixture.preferenceUpdates[0].data.emailEnabled, false);
});

test("clicked and opened never touch MonitorAlertPreference", async () => {
  const fixture = createFixture();
  fixture.seedDigest("digest-1", "user-1", "email_abc");

  await fixture.service.processEvent("svix-1", {
    type: "email.clicked",
    data: { email_id: "email_abc", link: "https://earlycv.com.br/monitor" },
  });
  await fixture.service.processEvent("svix-2", {
    type: "email.opened",
    data: { email_id: "email_abc" },
  });

  assert.equal(fixture.preferenceUpdates.length, 0);
  assert.deepEqual(
    fixture.recordedEvents.map((e) => e.eventName),
    ["monitor_digest_clicked", "monitor_digest_opened"],
  );
});

test("the opened event is tagged as indicative, never as confirmed reading", async () => {
  const fixture = createFixture();
  fixture.seedDigest("digest-1", "user-1", "email_abc");

  await fixture.service.processEvent("svix-1", {
    type: "email.opened",
    data: { email_id: "email_abc" },
  });

  assert.equal(fixture.recordedEvents[0].metadata.indicative, true);
});

test("a webhook for an unknown providerMessageId still records the raw event (digestId null) instead of dropping it silently", async () => {
  const fixture = createFixture();

  const result = await fixture.service.processEvent("svix-1", {
    type: "email.delivered",
    data: { email_id: "email_never_sent_by_us" },
  });

  assert.equal(result.processed, true);
  assert.equal(fixture.events.get("svix-1")?.digestId, null);
  assert.equal(fixture.recordedEvents[0].userId, null);
});

test("a payload without email_id is rejected", async () => {
  const fixture = createFixture();

  const result = await fixture.service.processEvent("svix-1", {
    type: "email.delivered",
    data: {},
  });

  assert.equal(result.processed, false);
  assert.equal(result.reason, "missing_email_id");
});
