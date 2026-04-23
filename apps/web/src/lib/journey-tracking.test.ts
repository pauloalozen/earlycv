import { expect, test } from "vitest";

import {
  buildCheckoutAbandonmentKey,
  consumeSessionEngagedOnce,
  consumeSessionStartedOnce,
  createJourneyState,
  evaluateCheckoutAbandonment,
  finishRouteVisit,
  finishRouteVisitAndReset,
  isJourneyRouteEligible,
  startRouteVisit,
} from "./journey-tracking.ts";

test("isJourneyRouteEligible gates admin and superadmin paths", () => {
  expect(isJourneyRouteEligible("/")).toBe(true);
  expect(isJourneyRouteEligible("/adaptar")).toBe(true);

  expect(isJourneyRouteEligible("/admin")).toBe(false);
  expect(isJourneyRouteEligible("/admin/usuarios")).toBe(false);
  expect(isJourneyRouteEligible("/superadmin")).toBe(false);
  expect(isJourneyRouteEligible("/superadmin/equipe")).toBe(false);
});

test("route visit lifecycle returns routeVisitId and exact timeOnPageMs", () => {
  const initialState = createJourneyState();
  const startedAtMs = 1_700_000_000_000;
  const finishedAtMs = startedAtMs + 4_321;

  const startedState = startRouteVisit(initialState, {
    pathname: "/adaptar",
    startedAtMs,
  });

  const result = finishRouteVisit(startedState, { finishedAtMs });

  expect(result).not.toBeNull();
  expect(result?.routeVisitId.length).toBeGreaterThan(0);
  expect(result?.timeOnPageMs).toBe(4_321);
});

test("route visit finish handles empty state and clamps negative durations", () => {
  const initialState = createJourneyState();

  expect(finishRouteVisit(initialState, { finishedAtMs: 123 })).toBeNull();

  const startedState = startRouteVisit(initialState, {
    pathname: "/adaptar",
    startedAtMs: 2_000,
  });
  const result = finishRouteVisit(startedState, { finishedAtMs: 1_000 });

  expect(result).not.toBeNull();
  expect(result?.timeOnPageMs).toBe(0);
});

test("route visit finish-and-reset prevents duplicate finish from same state", () => {
  const startedState = startRouteVisit(createJourneyState(), {
    pathname: "/adaptar",
    startedAtMs: 10_000,
  });

  const first = finishRouteVisitAndReset(startedState, {
    finishedAtMs: 12_000,
  });
  expect(first.event).not.toBeNull();

  const second = finishRouteVisitAndReset(first.state, {
    finishedAtMs: 13_000,
  });
  expect(second.event).toBeNull();
});

test("session one-shot helpers emit only once", () => {
  const state = createJourneyState();

  const startedFirst = consumeSessionStartedOnce(state);
  expect(startedFirst.shouldEmit).toBe(true);

  const startedSecond = consumeSessionStartedOnce(startedFirst.state);
  expect(startedSecond.shouldEmit).toBe(false);

  const engagedFirst = consumeSessionEngagedOnce(startedSecond.state);
  expect(engagedFirst.shouldEmit).toBe(true);

  const engagedSecond = consumeSessionEngagedOnce(engagedFirst.state);
  expect(engagedSecond.shouldEmit).toBe(false);
});

test("checkout abandonment emits once after sixty seconds", () => {
  const marker = {
    pathname: "/checkout",
    planSlug: "pro",
    startedAtMs: 10_000,
  };
  const key = buildCheckoutAbandonmentKey(marker);
  expect(key.length).toBeGreaterThan(0);

  const state = createJourneyState();

  const beforeSixtySeconds = evaluateCheckoutAbandonment(state, marker, 69_999);
  expect(beforeSixtySeconds.shouldEmit).toBe(false);

  const atSixtySeconds = evaluateCheckoutAbandonment(
    beforeSixtySeconds.state,
    marker,
    70_000,
  );
  expect(atSixtySeconds.shouldEmit).toBe(true);

  const afterTracked = evaluateCheckoutAbandonment(
    atSixtySeconds.state,
    marker,
    90_000,
  );
  expect(afterTracked.shouldEmit).toBe(false);
});
