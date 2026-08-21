import assert from "node:assert/strict";
import { test } from "node:test";
import {
  classifyJourneySession,
  type JourneySessionEventSignal,
} from "./journey-session-classification";

let clock = 0;
function signal(
  eventName: string,
  isAuthenticated: boolean,
): JourneySessionEventSignal {
  clock += 1;
  return { eventName, occurredAt: new Date(clock * 1000), isAuthenticated };
}

test("new visitor who signs up mid-journey classifies as new_user_journey", () => {
  const signals = [
    signal("page_view", false),
    signal("job_description_filled", false),
    signal("analyze_submit_clicked", false),
    signal("analysis_started", false),
    signal("analysis_result_viewed", false),
    signal("signup_completed", false),
  ];

  assert.equal(classifyJourneySession(signals), "new_user_journey");
});

test("visitor who never authenticates or signs up classifies as anonymous_journey", () => {
  const signals = [
    signal("page_view", false),
    signal("job_description_filled", false),
    signal("analyze_submit_clicked", false),
    signal("analysis_started", false),
    signal("analysis_result_viewed", false),
  ];

  assert.equal(classifyJourneySession(signals), "anonymous_journey");
});

test("session that starts already authenticated (returning user, no explicit login) classifies as existing_user_journey", () => {
  const signals = [
    signal("page_view", true),
    signal("dashboard_viewed", true),
    signal("analysis_started", true),
  ];

  assert.equal(classifyJourneySession(signals), "existing_user_journey");
});

test("existing user who starts anonymous and later logs in explicitly: the whole journey classifies as existing_user_journey", () => {
  const signals = [
    signal("page_view", false),
    signal("job_description_filled", false),
    signal("login_completed", false),
    signal("dashboard_viewed", true),
  ];

  assert.equal(classifyJourneySession(signals), "existing_user_journey");
});

test("Radar entry from a brand-new visitor who signs up still classifies as new_user_journey (origin never changes the classification)", () => {
  const signals = [
    signal("radar_view", false),
    signal("radar_opportunity_clicked", false),
    signal("signup_completed", false),
  ];

  assert.equal(classifyJourneySession(signals), "new_user_journey");
});

test("Radar entry from an existing user who logs in explicitly classifies as existing_user_journey (origin never changes the classification)", () => {
  const signals = [
    signal("radar_view", false),
    signal("radar_opportunity_clicked", false),
    signal("login_completed", false),
  ];

  assert.equal(classifyJourneySession(signals), "existing_user_journey");
});

test("homepage, SEO, partner or /adaptar origins with the same signal shape produce the same classification", () => {
  const baseline = classifyJourneySession([
    signal("page_view", false),
    signal("signup_completed", false),
  ]);

  for (const origin of [
    "landing_cta_click",
    "seo_page_viewed",
    "blog_post_viewed",
    "job_description_filled",
  ]) {
    const signals = [signal(origin, false), signal("signup_completed", false)];
    assert.equal(
      classifyJourneySession(signals),
      baseline,
      `origin event ${origin} must not change the classification`,
    );
  }
});

test("empty session has no derivable signal and classifies as unknown", () => {
  assert.equal(classifyJourneySession([]), "unknown");
});

test("contradictory session with both signup_completed and login_completed classifies as unknown, never guessed", () => {
  const signals = [
    signal("page_view", false),
    signal("signup_completed", false),
    signal("login_completed", false),
  ];

  assert.equal(classifyJourneySession(signals), "unknown");
});

test("session that becomes authenticated mid-journey without an explicit login_completed or signup_completed classifies as unknown", () => {
  const signals = [
    signal("page_view", false),
    signal("dashboard_viewed", true),
  ];

  assert.equal(classifyJourneySession(signals), "unknown");
});

test("classification does not depend on array input order — it is derived from occurredAt, not insertion order", () => {
  const first = signal("page_view", false);
  const second = signal("signup_completed", false);

  assert.equal(
    classifyJourneySession([first, second]),
    classifyJourneySession([second, first]),
  );
});

test("auth_session_identified firing mid-session (even flagged as authenticated) is never treated as proof of new or existing user by itself — falls to unknown without an explicit signup/login event", () => {
  const signals = [
    signal("page_view", false),
    // auth_session_identified é o único evento "autenticado" da sessão,
    // mas não é login_completed nem signup_completed, e não é o
    // primeiro evento — não pode virar existing_user_journey sozinho.
    signal("auth_session_identified", true),
  ];

  assert.equal(classifyJourneySession(signals), "unknown");
});
