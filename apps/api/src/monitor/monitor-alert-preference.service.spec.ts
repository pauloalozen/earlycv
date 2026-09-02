import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import { MonitorAlertPreferenceService } from "./monitor-alert-preference.service";
import { createMonitorUnsubscribeToken } from "./monitor-unsubscribe-token";

let originalSecret: string | undefined;

beforeEach(() => {
  originalSecret = process.env.MONITOR_DIGEST_UNSUBSCRIBE_SECRET;
  process.env.MONITOR_DIGEST_UNSUBSCRIBE_SECRET = "test-secret";
});

afterEach(() => {
  process.env.MONITOR_DIGEST_UNSUBSCRIBE_SECRET = originalSecret;
});

const MonitorAlertPreferenceServiceCtor =
  MonitorAlertPreferenceService as unknown as new (
    db: unknown,
    funnelEvents: unknown,
    entitlementService: unknown,
  ) => MonitorAlertPreferenceService;

const NOOP_FUNNEL_EVENTS = {
  record: async () => ({ event: null, ingested: true }),
};

const ALLOW_ENTITLEMENT = {
  canUseMonitor: async () => ({ allowed: true, reason: "internal_access" }),
};

function createFixture() {
  const preferences = new Map<
    string,
    {
      userId: string;
      emailEnabled: boolean;
      frequency: string;
      unsubscribedAt: Date | null;
    }
  >();

  const db = {
    monitorAlertPreference: {
      findUnique: async ({ where }: { where: { userId: string } }) =>
        preferences.get(where.userId) ?? null,
      upsert: async ({
        where,
        create,
      }: {
        where: { userId: string };
        create: Record<string, unknown>;
      }) => {
        const existing = preferences.get(where.userId);
        if (existing) return existing;
        const next = {
          userId: where.userId,
          emailEnabled: true,
          frequency: "DAILY",
          unsubscribedAt: null,
          ...create,
        };
        preferences.set(where.userId, next);
        return next;
      },
      update: async ({
        where,
        data,
      }: {
        where: { userId: string };
        data: Record<string, unknown>;
      }) => {
        const current = preferences.get(where.userId);
        assert.ok(current, `preference for ${where.userId} must exist`);
        const next = { ...current, ...data };
        preferences.set(where.userId, next);
        return next;
      },
    },
  };

  return { db, preferences };
}

test("getOrCreate defaults a new user to DAILY + emailEnabled", async () => {
  const { db } = createFixture();
  const service = new MonitorAlertPreferenceServiceCtor(
    db,
    NOOP_FUNNEL_EVENTS,
    ALLOW_ENTITLEMENT,
  );

  const preference = await service.getOrCreate("user-1");

  assert.equal(preference.emailEnabled, true);
  assert.equal(preference.frequency, "DAILY");
});

test("getOrCreate returns the existing row unchanged on subsequent calls", async () => {
  const { db, preferences } = createFixture();
  preferences.set("user-1", {
    userId: "user-1",
    emailEnabled: false,
    frequency: "WEEKLY",
    unsubscribedAt: new Date("2026-01-01T00:00:00Z"),
  });
  const service = new MonitorAlertPreferenceServiceCtor(
    db,
    NOOP_FUNNEL_EVENTS,
    ALLOW_ENTITLEMENT,
  );

  const preference = await service.getOrCreate("user-1");

  assert.equal(preference.emailEnabled, false);
  assert.equal(preference.frequency, "WEEKLY");
});

test("update only touches the fields provided", async () => {
  const { db } = createFixture();
  const service = new MonitorAlertPreferenceServiceCtor(
    db,
    NOOP_FUNNEL_EVENTS,
    ALLOW_ENTITLEMENT,
  );
  await service.getOrCreate("user-1");

  const updated = await service.update("user-1", { frequency: "OFF" as never });

  assert.equal(updated.frequency, "OFF");
  assert.equal(updated.emailEnabled, true);
});

function createFunnelEventsCapture() {
  const recordedEvents: string[] = [];
  const recordedMetadata: Record<string, unknown>[] = [];
  const funnelEvents = {
    record: async (input: {
      eventName: string;
      metadata?: Record<string, unknown>;
    }) => {
      recordedEvents.push(input.eventName);
      recordedMetadata.push(input.metadata ?? {});
      return { event: null, ingested: true };
    },
  };
  return { funnelEvents, recordedEvents, recordedMetadata };
}

test("update records monitor_alert_frequency_changed with previous/new frequency when frequency actually changes", async () => {
  const { db } = createFixture();
  const { funnelEvents, recordedEvents, recordedMetadata } =
    createFunnelEventsCapture();
  const service = new MonitorAlertPreferenceServiceCtor(
    db,
    funnelEvents,
    ALLOW_ENTITLEMENT,
  );
  await service.getOrCreate("user-1");

  await service.update("user-1", { frequency: "WEEKLY" as never });

  assert.deepEqual(recordedEvents, ["monitor_alert_frequency_changed"]);
  assert.equal(recordedMetadata[0]?.previous_frequency, "DAILY");
  assert.equal(recordedMetadata[0]?.new_frequency, "WEEKLY");
  assert.equal(recordedMetadata[0]?.product_origin, "monitor");
  assert.equal(recordedMetadata[0]?.monitor_access_type, "internal_access");
});

test("update covers every transition direction, including into and out of OFF", async () => {
  const { db } = createFixture();
  const { funnelEvents, recordedMetadata } = createFunnelEventsCapture();
  const service = new MonitorAlertPreferenceServiceCtor(
    db,
    funnelEvents,
    ALLOW_ENTITLEMENT,
  );
  await service.getOrCreate("user-1");

  await service.update("user-1", { frequency: "OFF" as never });
  await service.update("user-1", { frequency: "DAILY" as never });
  await service.update("user-1", { frequency: "WEEKLY" as never });

  assert.deepEqual(
    recordedMetadata.map((m) => [m.previous_frequency, m.new_frequency]),
    [
      ["DAILY", "OFF"],
      ["OFF", "DAILY"],
      ["DAILY", "WEEKLY"],
    ],
  );
});

test("update does not record monitor_alert_frequency_changed when only emailEnabled changes, without frequency", async () => {
  const { db } = createFixture();
  const { funnelEvents, recordedEvents } = createFunnelEventsCapture();
  const service = new MonitorAlertPreferenceServiceCtor(
    db,
    funnelEvents,
    ALLOW_ENTITLEMENT,
  );
  await service.getOrCreate("user-1");

  await service.update("user-1", { emailEnabled: false });

  assert.deepEqual(recordedEvents, []);
});

test("update does not record monitor_alert_frequency_changed when frequency is sent but unchanged", async () => {
  const { db } = createFixture();
  const { funnelEvents, recordedEvents } = createFunnelEventsCapture();
  const service = new MonitorAlertPreferenceServiceCtor(
    db,
    funnelEvents,
    ALLOW_ENTITLEMENT,
  );
  await service.getOrCreate("user-1");

  await service.update("user-1", { frequency: "DAILY" as never });

  assert.deepEqual(recordedEvents, []);
});

test("unsubscribeByToken disables email, sets unsubscribedAt, and records monitor_digest_unsubscribed", async () => {
  const { db } = createFixture();
  const recordedEvents: string[] = [];
  const recordedMetadata: Record<string, unknown>[] = [];
  const funnelEvents = {
    record: async (input: {
      eventName: string;
      metadata?: Record<string, unknown>;
    }) => {
      recordedEvents.push(input.eventName);
      recordedMetadata.push(input.metadata ?? {});
      return { event: null, ingested: true };
    },
  };
  const service = new MonitorAlertPreferenceServiceCtor(
    db,
    funnelEvents,
    ALLOW_ENTITLEMENT,
  );
  const token = createMonitorUnsubscribeToken("user-1");

  const updated = await service.unsubscribeByToken(token);

  assert.ok(updated);
  assert.equal(updated?.emailEnabled, false);
  assert.ok(updated?.unsubscribedAt instanceof Date);
  assert.deepEqual(recordedEvents, ["monitor_digest_unsubscribed"]);
  assert.equal(recordedMetadata[0]?.monitor_access_type, "internal_access");
});

test("unsubscribeByToken never touches frequency, only the emailEnabled switch", async () => {
  const { db, preferences } = createFixture();
  preferences.set("user-1", {
    userId: "user-1",
    emailEnabled: true,
    frequency: "WEEKLY",
    unsubscribedAt: null,
  });
  const service = new MonitorAlertPreferenceServiceCtor(
    db,
    NOOP_FUNNEL_EVENTS,
    ALLOW_ENTITLEMENT,
  );
  const token = createMonitorUnsubscribeToken("user-1");

  const updated = await service.unsubscribeByToken(token);

  assert.equal(updated?.frequency, "WEEKLY");
});

test("unsubscribeByToken with an invalid token returns null and records nothing", async () => {
  const { db } = createFixture();
  const recordedEvents: string[] = [];
  const funnelEvents = {
    record: async (input: { eventName: string }) => {
      recordedEvents.push(input.eventName);
      return { event: null, ingested: true };
    },
  };
  const service = new MonitorAlertPreferenceServiceCtor(
    db,
    funnelEvents,
    ALLOW_ENTITLEMENT,
  );

  const result = await service.unsubscribeByToken("not-a-real-token");

  assert.equal(result, null);
  assert.deepEqual(recordedEvents, []);
});

test("verifyUnsubscribeToken (the GET path) never mutates the preference — only validates the token", async () => {
  const { db, preferences } = createFixture();
  const service = new MonitorAlertPreferenceServiceCtor(
    db,
    NOOP_FUNNEL_EVENTS,
    ALLOW_ENTITLEMENT,
  );
  const token = createMonitorUnsubscribeToken("user-1");

  const userId = service.verifyUnsubscribeToken(token);

  assert.equal(userId, "user-1");
  // Nada foi criado/alterado — GET não tem efeito colateral nenhum.
  assert.equal(preferences.has("user-1"), false);
});

test("verifyUnsubscribeToken returns null for an invalid token, without touching the database", async () => {
  const { db, preferences } = createFixture();
  const service = new MonitorAlertPreferenceServiceCtor(
    db,
    NOOP_FUNNEL_EVENTS,
    ALLOW_ENTITLEMENT,
  );

  const userId = service.verifyUnsubscribeToken("garbage-token");

  assert.equal(userId, null);
  assert.equal(preferences.size, 0);
});

test("unsubscribeByToken (the POST path) called twice is idempotent — same end state, unsubscribedAt not reset on the second call", async () => {
  const { db } = createFixture();
  const service = new MonitorAlertPreferenceServiceCtor(
    db,
    NOOP_FUNNEL_EVENTS,
    ALLOW_ENTITLEMENT,
  );
  const token = createMonitorUnsubscribeToken("user-1");

  const first = await service.unsubscribeByToken(token);
  assert.ok(first);
  const firstUnsubscribedAt = first?.unsubscribedAt;

  const second = await service.unsubscribeByToken(token);

  assert.equal(second?.emailEnabled, false);
  assert.equal(second?.unsubscribedAt, firstUnsubscribedAt);
});

test("unsubscribeByToken always returns success (never an error) even when already unsubscribed", async () => {
  const { db } = createFixture();
  const service = new MonitorAlertPreferenceServiceCtor(
    db,
    NOOP_FUNNEL_EVENTS,
    ALLOW_ENTITLEMENT,
  );
  const token = createMonitorUnsubscribeToken("user-1");

  await service.unsubscribeByToken(token);
  const second = await service.unsubscribeByToken(token);

  assert.ok(second);
  assert.equal(second?.emailEnabled, false);
});
