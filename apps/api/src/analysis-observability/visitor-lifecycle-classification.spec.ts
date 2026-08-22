import assert from "node:assert/strict";
import { test } from "node:test";

import {
  classifyVisitorLifecycle,
  type VisitorEventSignal,
} from "./visitor-lifecycle-classification";

test("classifyVisitorLifecycle returns unknown with no signals", () => {
  assert.equal(classifyVisitorLifecycle("session-a", []), "unknown");
});

test("classifyVisitorLifecycle returns unknown when the current session never appears in the history", () => {
  const signals: VisitorEventSignal[] = [
    { sessionInternalId: "session-a", occurredAt: new Date("2026-01-01") },
  ];
  assert.equal(classifyVisitorLifecycle("session-b", signals), "unknown");
});

test("classifyVisitorLifecycle returns new_visitor when the current session is the earliest known session for the visitor", () => {
  const signals: VisitorEventSignal[] = [
    { sessionInternalId: "session-a", occurredAt: new Date("2026-01-01") },
  ];
  assert.equal(classifyVisitorLifecycle("session-a", signals), "new_visitor");
});

test("classifyVisitorLifecycle returns returning_visitor when an earlier different session exists for the same visitor", () => {
  const signals: VisitorEventSignal[] = [
    { sessionInternalId: "session-a", occurredAt: new Date("2026-01-01") },
    { sessionInternalId: "session-b", occurredAt: new Date("2026-01-02") },
  ];

  assert.equal(classifyVisitorLifecycle("session-a", signals), "new_visitor");
  assert.equal(
    classifyVisitorLifecycle("session-b", signals),
    "returning_visitor",
  );
});

test("classifyVisitorLifecycle is order-independent — sorts by occurredAt, not input array order", () => {
  const signals: VisitorEventSignal[] = [
    { sessionInternalId: "session-b", occurredAt: new Date("2026-01-02") },
    { sessionInternalId: "session-a", occurredAt: new Date("2026-01-01") },
  ];

  assert.equal(classifyVisitorLifecycle("session-a", signals), "new_visitor");
  assert.equal(
    classifyVisitorLifecycle("session-b", signals),
    "returning_visitor",
  );
});

test("classifyVisitorLifecycle handles a third, even later session as returning_visitor too", () => {
  const signals: VisitorEventSignal[] = [
    { sessionInternalId: "session-a", occurredAt: new Date("2026-01-01") },
    { sessionInternalId: "session-b", occurredAt: new Date("2026-01-02") },
    { sessionInternalId: "session-c", occurredAt: new Date("2026-01-03") },
  ];

  assert.equal(
    classifyVisitorLifecycle("session-c", signals),
    "returning_visitor",
  );
});
