import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import {
  createMonitorUnsubscribeToken,
  verifyMonitorUnsubscribeToken,
} from "./monitor-unsubscribe-token";

let originalSecret: string | undefined;

beforeEach(() => {
  originalSecret = process.env.MONITOR_DIGEST_UNSUBSCRIBE_SECRET;
  process.env.MONITOR_DIGEST_UNSUBSCRIBE_SECRET = "test-secret-value";
});

afterEach(() => {
  process.env.MONITOR_DIGEST_UNSUBSCRIBE_SECRET = originalSecret;
});

test("a token created for a user verifies back to that same userId", () => {
  const token = createMonitorUnsubscribeToken("user-1");
  assert.equal(verifyMonitorUnsubscribeToken(token), "user-1");
});

test("a tampered token (payload swapped) is rejected", () => {
  const tokenA = createMonitorUnsubscribeToken("user-a");
  const tokenB = createMonitorUnsubscribeToken("user-b");
  const [, signatureB] = tokenB.split(".");
  const [payloadA] = tokenA.split(".");
  const forged = `${payloadA}.${signatureB}`;

  assert.equal(verifyMonitorUnsubscribeToken(forged), null);
});

test("a malformed token (wrong shape) is rejected without throwing", () => {
  assert.equal(verifyMonitorUnsubscribeToken("not-a-real-token"), null);
  assert.equal(verifyMonitorUnsubscribeToken(""), null);
  assert.equal(verifyMonitorUnsubscribeToken("a.b.c"), null);
});

test("verification never throws when the secret is missing — returns null instead", () => {
  delete process.env.MONITOR_DIGEST_UNSUBSCRIBE_SECRET;
  assert.equal(verifyMonitorUnsubscribeToken("whatever.token"), null);
});

test("creating a token without a configured secret throws loudly instead of signing insecurely", () => {
  delete process.env.MONITOR_DIGEST_UNSUBSCRIBE_SECRET;
  assert.throws(() => createMonitorUnsubscribeToken("user-1"));
});
