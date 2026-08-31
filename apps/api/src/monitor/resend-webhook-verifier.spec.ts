import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";

import { verifyResendWebhookSignature } from "./resend-webhook-verifier";

const SECRET = "whsec_c2VjcmV0a2V5MTIzNDU2Nzg=";

function sign(svixId: string, svixTimestamp: string, rawBody: Buffer) {
  const secretBytes = Buffer.from(SECRET.slice("whsec_".length), "base64");
  const signedContent = `${svixId}.${svixTimestamp}.${rawBody.toString("utf8")}`;
  const signature = createHmac("sha256", secretBytes)
    .update(signedContent)
    .digest("base64");
  return `v1,${signature}`;
}

test("accepts a correctly signed, fresh webhook", () => {
  const rawBody = Buffer.from(JSON.stringify({ type: "email.delivered" }));
  const svixId = "msg_123";
  const svixTimestamp = String(Math.floor(Date.now() / 1000));
  const svixSignature = sign(svixId, svixTimestamp, rawBody);

  const valid = verifyResendWebhookSignature(
    rawBody,
    { svixId, svixTimestamp, svixSignature },
    SECRET,
  );

  assert.equal(valid, true);
});

test("accepts when svix-signature carries multiple space-separated candidates (secret rotation) and any one matches", () => {
  const rawBody = Buffer.from(JSON.stringify({ type: "email.opened" }));
  const svixId = "msg_456";
  const svixTimestamp = String(Math.floor(Date.now() / 1000));
  const realSignature = sign(svixId, svixTimestamp, rawBody);
  const svixSignature = `v1,bm90dGhlcmlnaHRvbmU= ${realSignature}`;

  const valid = verifyResendWebhookSignature(
    rawBody,
    { svixId, svixTimestamp, svixSignature },
    SECRET,
  );

  assert.equal(valid, true);
});

test("rejects when the body was tampered with after signing", () => {
  const originalBody = Buffer.from(JSON.stringify({ type: "email.delivered" }));
  const svixId = "msg_789";
  const svixTimestamp = String(Math.floor(Date.now() / 1000));
  const svixSignature = sign(svixId, svixTimestamp, originalBody);

  const tamperedBody = Buffer.from(JSON.stringify({ type: "email.bounced" }));

  const valid = verifyResendWebhookSignature(
    tamperedBody,
    { svixId, svixTimestamp, svixSignature },
    SECRET,
  );

  assert.equal(valid, false);
});

test("rejects a signature produced with the wrong secret", () => {
  const rawBody = Buffer.from(JSON.stringify({ type: "email.clicked" }));
  const svixId = "msg_wrong_secret";
  const svixTimestamp = String(Math.floor(Date.now() / 1000));
  const secretBytes = Buffer.from("d29uJ3QtbWF0Y2g=", "base64");
  const signedContent = `${svixId}.${svixTimestamp}.${rawBody.toString("utf8")}`;
  const svixSignature = `v1,${createHmac("sha256", secretBytes).update(signedContent).digest("base64")}`;

  const valid = verifyResendWebhookSignature(
    rawBody,
    { svixId, svixTimestamp, svixSignature },
    SECRET,
  );

  assert.equal(valid, false);
});

test("rejects a stale timestamp (replay protection)", () => {
  const rawBody = Buffer.from(JSON.stringify({ type: "email.complained" }));
  const svixId = "msg_old";
  const staleTimestamp = String(Math.floor(Date.now() / 1000) - 60 * 60);
  const svixSignature = sign(svixId, staleTimestamp, rawBody);

  const valid = verifyResendWebhookSignature(
    rawBody,
    { svixId, svixTimestamp: staleTimestamp, svixSignature },
    SECRET,
  );

  assert.equal(valid, false);
});

test("rejects when any required header is missing", () => {
  const rawBody = Buffer.from("{}");
  assert.equal(
    verifyResendWebhookSignature(
      rawBody,
      { svixId: undefined, svixTimestamp: "123", svixSignature: "v1,abc" },
      SECRET,
    ),
    false,
  );
  assert.equal(
    verifyResendWebhookSignature(
      rawBody,
      { svixId: "id", svixTimestamp: undefined, svixSignature: "v1,abc" },
      SECRET,
    ),
    false,
  );
  assert.equal(
    verifyResendWebhookSignature(
      rawBody,
      { svixId: "id", svixTimestamp: "123", svixSignature: undefined },
      SECRET,
    ),
    false,
  );
});
