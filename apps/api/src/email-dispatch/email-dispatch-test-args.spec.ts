import assert from "node:assert/strict";
import { test } from "node:test";

import { parseTestArgs, TestArgsError } from "./email-dispatch-test-args";

const ok = (...args: string[]) => parseTestArgs(args);
const bad = (...args: string[]) =>
  assert.throws(() => parseTestArgs(args), TestArgsError, args.join(" "));

test("default is DRY-RUN: real transport is never implied", () => {
  const parsed = ok("--kind", "welcome", "--to", "Paulo.Alozen@gmail.com");
  assert.equal(parsed.transport, "dry-run");
  assert.equal(parsed.to, "paulo.alozen@gmail.com");
  assert.equal(parsed.noDb, false);
});

test("fake and real are explicit and mutually exclusive", () => {
  assert.equal(
    ok("--kind", "feedback", "--to", "a@b.com", "--fake-send").transport,
    "fake",
  );
  assert.equal(
    ok("--kind", "feedback", "--to", "a@b.com", "--real-send").transport,
    "real",
  );
  bad("--kind", "feedback", "--to", "a@b.com", "--fake-send", "--real-send");
});

test("exactly ONE informed recipient — never a list, never missing, never repeated", () => {
  bad("--kind", "welcome");
  bad("--kind", "welcome", "--to", "a@b.com,c@d.com", "--real-send");
  bad("--kind", "welcome", "--to", "a@b.com c@d.com", "--real-send");
  bad("--kind", "welcome", "--to", "a@b.com;c@d.com", "--real-send");
  bad("--kind", "welcome", "--to", "a@b.com", "--to", "c@d.com", "--real-send");
  bad("--kind", "welcome", "--to", "Nome <a@b.com>", "--real-send");
  bad("--kind", "welcome", "--to", "not-an-email", "--real-send");
  bad("--kind", "welcome", "--to", "a@b.com", "c@d.com"); // posicional
});

test("--no-db requires --real-send and is only for welcome/feedback", () => {
  assert.equal(
    ok("--kind", "welcome", "--to", "a@b.com", "--real-send", "--no-db").noDb,
    true,
  );
  bad("--kind", "welcome", "--to", "a@b.com", "--no-db");
  bad("--kind", "welcome", "--to", "a@b.com", "--fake-send", "--no-db");
  bad("--kind", "purchase", "--to", "a@b.com", "--real-send", "--no-db");
});

test("kind is required and closed", () => {
  bad("--to", "a@b.com");
  bad("--kind", "everyone", "--to", "a@b.com");
  bad("--kind", "welcome", "--to", "a@b.com", "--unknown-flag");
});

test("purchase payload: paid vs 100% coupon, validated numbers", () => {
  const paid = ok(
    "--kind",
    "purchase",
    "--to",
    "a@b.com",
    "--plan",
    "pro",
    "--amount",
    "4990",
    "--credits",
    "5",
    "--analysis",
    "5",
  );
  assert.deepEqual(paid.payload, {
    planType: "pro",
    amountInCents: 4990,
    currency: "BRL",
    credits: 5,
    analysisCredits: 5,
    isUnlimited: false,
    isCouponRedemption: false,
  });

  const coupon = ok(
    "--kind",
    "purchase",
    "--to",
    "a@b.com",
    "--coupon",
    "--amount",
    "999",
  );
  assert.equal(coupon.payload?.isCouponRedemption, true);
  assert.equal(coupon.payload?.amountInCents, 0);

  bad("--kind", "purchase", "--to", "a@b.com", "--amount", "-5");
  bad("--kind", "purchase", "--to", "a@b.com", "--credits", "x");
  assert.equal(ok("--kind", "welcome", "--to", "a@b.com").payload, undefined);
});
