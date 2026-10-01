import assert from "node:assert/strict";
import { test } from "node:test";

import {
  adjustToFeedbackWindow,
  computeFeedbackScheduledFor,
} from "./email-dispatch-schedule.util";

// Brasília = UTC-3. 08:00 BRT = 11:00Z; 20:00 BRT = 23:00Z.
const iso = (date: Date) => date.toISOString();

test("adjustToFeedbackWindow keeps instants inside 08:00–20:00 Brasília", () => {
  assert.equal(
    iso(adjustToFeedbackWindow(new Date("2026-10-05T11:00:00.000Z"))),
    "2026-10-05T11:00:00.000Z",
  ); // exatamente 08:00
  assert.equal(
    iso(adjustToFeedbackWindow(new Date("2026-10-05T22:59:00.000Z"))),
    "2026-10-05T22:59:00.000Z",
  ); // 19:59
});

test("adjustToFeedbackWindow moves night/early-morning instants to the NEXT 08:00 Brasília", () => {
  // 23:00Z = 20:00 BRT (fim exclusivo) -> dia seguinte 08:00 BRT
  assert.equal(
    iso(adjustToFeedbackWindow(new Date("2026-10-05T23:00:00.000Z"))),
    "2026-10-06T11:00:00.000Z",
  );
  // 02:00Z de 06/10 = 23:00 BRT de 05/10 -> 06/10 08:00 BRT
  assert.equal(
    iso(adjustToFeedbackWindow(new Date("2026-10-06T02:00:00.000Z"))),
    "2026-10-06T11:00:00.000Z",
  );
  // 08:00Z = 05:00 BRT (madrugada) -> MESMO dia 08:00 BRT
  assert.equal(
    iso(adjustToFeedbackWindow(new Date("2026-10-05T08:00:00.000Z"))),
    "2026-10-05T11:00:00.000Z",
  );
  // 10:59Z = 07:59 BRT -> 08:00 BRT do mesmo dia
  assert.equal(
    iso(adjustToFeedbackWindow(new Date("2026-10-05T10:59:00.000Z"))),
    "2026-10-05T11:00:00.000Z",
  );
});

test("adjustToFeedbackWindow handles month rollover", () => {
  assert.equal(
    iso(adjustToFeedbackWindow(new Date("2026-10-31T23:30:00.000Z"))),
    "2026-11-01T11:00:00.000Z",
  );
});

test("computeFeedbackScheduledFor is exactly signup + 24h in the normal case (verified within minutes)", () => {
  const createdAt = new Date("2026-10-05T14:00:00.000Z"); // 11:00 BRT
  const welcomeScheduledFor = new Date("2026-10-05T14:20:00.000Z");

  assert.equal(
    iso(computeFeedbackScheduledFor({ createdAt, welcomeScheduledFor })),
    "2026-10-06T14:00:00.000Z",
  );
});

test("computeFeedbackScheduledFor pushes a 24h mark that falls at night to 08:00 Brasília", () => {
  const createdAt = new Date("2026-10-05T02:30:00.000Z"); // 23:30 BRT do dia 04
  const welcomeScheduledFor = new Date("2026-10-05T02:40:00.000Z");

  // 24h depois = 06/10 02:30Z = 23:30 BRT -> 06/10 08:00 BRT = 11:00Z
  assert.equal(
    iso(computeFeedbackScheduledFor({ createdAt, welcomeScheduledFor })),
    "2026-10-06T11:00:00.000Z",
  );
});

test("late verification: feedback never lands within 12h of the welcome", () => {
  const createdAt = new Date("2026-10-01T15:00:00.000Z");
  // verificou 10 dias depois -> welcome 10 min depois da verificação
  const welcomeScheduledFor = new Date("2026-10-11T15:10:00.000Z");

  const feedback = computeFeedbackScheduledFor({
    createdAt,
    welcomeScheduledFor,
  });

  const gapMs = feedback.getTime() - welcomeScheduledFor.getTime();
  assert.ok(gapMs >= 12 * 60 * 60_000, `gap foi ${gapMs}ms`);
  assert.equal(iso(feedback), "2026-10-12T11:00:00.000Z");
});
