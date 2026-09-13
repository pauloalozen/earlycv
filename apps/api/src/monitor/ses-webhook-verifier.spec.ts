import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createSign } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
  buildStringToSign,
  isTrustedSnsCertUrl,
  verifySignatureWithPem,
} from "./ses-webhook-verifier";

test("isTrustedSnsCertUrl accepts only https URLs on the official AWS SNS certificate domain", () => {
  assert.equal(
    isTrustedSnsCertUrl(
      "https://sns.us-east-1.amazonaws.com/SimpleNotificationService-abc.pem",
    ),
    true,
  );
  assert.equal(
    isTrustedSnsCertUrl(
      "https://sns.cn-north-1.amazonaws.com.cn/SimpleNotificationService-abc.pem",
    ),
    true,
  );
});

test("isTrustedSnsCertUrl rejects http (not https), lookalike hosts and unrelated domains — the core SSRF defense", () => {
  assert.equal(
    isTrustedSnsCertUrl(
      "http://sns.us-east-1.amazonaws.com/SimpleNotificationService-abc.pem",
    ),
    false,
    "must reject plain http",
  );
  assert.equal(
    isTrustedSnsCertUrl("https://sns.us-east-1.amazonaws.com.evil.com/x.pem"),
    false,
    "must reject a lookalike domain that only starts with the trusted host",
  );
  assert.equal(
    isTrustedSnsCertUrl("https://evil.com/sns.us-east-1.amazonaws.com"),
    false,
  );
  assert.equal(
    isTrustedSnsCertUrl("https://169.254.169.254/latest/meta-data/"),
    false,
  );
  assert.equal(isTrustedSnsCertUrl("not a url"), false);
});

test("buildStringToSign uses the exact field order/newline format AWS defines for Notification", () => {
  const message = {
    Type: "Notification",
    MessageId: "msg-1",
    TopicArn: "arn:aws:sns:us-east-1:123:topic",
    Subject: "subj",
    Message: "body",
    Timestamp: "2026-01-01T00:00:00.000Z",
    SignatureVersion: "1",
    Signature: "sig",
    SigningCertURL: "https://sns.us-east-1.amazonaws.com/cert.pem",
  };

  assert.equal(
    buildStringToSign(message),
    "Message\nbody\n" +
      "MessageId\nmsg-1\n" +
      "Subject\nsubj\n" +
      "Timestamp\n2026-01-01T00:00:00.000Z\n" +
      "TopicArn\narn:aws:sns:us-east-1:123:topic\n" +
      "Type\nNotification\n",
  );
});

test("buildStringToSign omits Subject when absent, and uses the SubscriptionConfirmation field set/order otherwise", () => {
  const notificationNoSubject = {
    Type: "Notification",
    MessageId: "msg-1",
    TopicArn: "arn:aws:sns:us-east-1:123:topic",
    Message: "body",
    Timestamp: "2026-01-01T00:00:00.000Z",
    SignatureVersion: "1",
    Signature: "sig",
    SigningCertURL: "https://sns.us-east-1.amazonaws.com/cert.pem",
  };
  assert.doesNotMatch(buildStringToSign(notificationNoSubject), /Subject/);

  const confirmation = {
    Type: "SubscriptionConfirmation",
    MessageId: "msg-1",
    TopicArn: "arn:aws:sns:us-east-1:123:topic",
    Message: "confirm",
    Timestamp: "2026-01-01T00:00:00.000Z",
    SignatureVersion: "1",
    Signature: "sig",
    SigningCertURL: "https://sns.us-east-1.amazonaws.com/cert.pem",
    SubscribeURL: "https://sns.us-east-1.amazonaws.com/confirm",
    Token: "tok",
  };
  assert.equal(
    buildStringToSign(confirmation),
    "Message\nconfirm\n" +
      "MessageId\nmsg-1\n" +
      "SubscribeURL\nhttps://sns.us-east-1.amazonaws.com/confirm\n" +
      "Timestamp\n2026-01-01T00:00:00.000Z\n" +
      "Token\ntok\n" +
      "TopicArn\narn:aws:sns:us-east-1:123:topic\n" +
      "Type\nSubscriptionConfirmation\n",
  );
});

test("verifySignatureWithPem rejects an unsupported SignatureVersion and a missing Signature without touching the PEM", () => {
  const base = {
    Type: "Notification",
    MessageId: "m",
    TopicArn: "t",
    Message: "b",
    Timestamp: "ts",
  };
  assert.equal(
    verifySignatureWithPem(
      { ...base, SignatureVersion: "3", Signature: "sig" },
      "not-a-real-pem",
    ),
    false,
  );
  assert.equal(
    verifySignatureWithPem(
      { ...base, SignatureVersion: "1", Signature: "" },
      "not-a-real-pem",
    ),
    false,
  );
});

test("verifySignatureWithPem returns false (never throws) for a malformed certificate", () => {
  assert.equal(
    verifySignatureWithPem(
      {
        Type: "Notification",
        MessageId: "m",
        TopicArn: "t",
        Message: "b",
        Timestamp: "ts",
        SignatureVersion: "1",
        Signature: "aGVsbG8=",
      },
      "-----BEGIN CERTIFICATE-----\nbm90IGEgcmVhbCBjZXJ0\n-----END CERTIFICATE-----",
    ),
    false,
  );
});

test("verifySignatureWithPem accepts a genuinely valid RSA-SHA1 signature against a real self-signed certificate, and rejects a tampered one", (t) => {
  let dir: string;
  try {
    dir = mkdtempSync(join(tmpdir(), "sns-verify-"));
  } catch {
    t.skip("could not create temp dir");
    return;
  }

  const keyPath = join(dir, "key.pem");
  const certPath = join(dir, "cert.pem");
  try {
    execFileSync("openssl", [
      "req",
      "-x509",
      "-newkey",
      "rsa:2048",
      "-keyout",
      keyPath,
      "-out",
      certPath,
      "-days",
      "1",
      "-nodes",
      "-subj",
      "/CN=sns-test",
    ]);
  } catch {
    t.skip("openssl CLI not available in this environment");
    rmSync(dir, { recursive: true, force: true });
    return;
  }

  try {
    const privateKeyPem = readFileSync(keyPath, "utf8");
    const certPem = readFileSync(certPath, "utf8");

    const message = {
      Type: "Notification",
      MessageId: "msg-1",
      TopicArn: "arn:aws:sns:us-east-1:123:topic",
      Message: "hello world",
      Timestamp: "2026-01-01T00:00:00.000Z",
      SignatureVersion: "1",
      SigningCertURL: "https://sns.us-east-1.amazonaws.com/cert.pem",
    };
    const stringToSign = buildStringToSign({ ...message, Signature: "" });
    const signature = createSign("RSA-SHA1")
      .update(stringToSign, "utf8")
      .end()
      .sign(privateKeyPem, "base64");

    assert.equal(
      verifySignatureWithPem({ ...message, Signature: signature }, certPem),
      true,
    );

    assert.equal(
      verifySignatureWithPem(
        { ...message, Message: "tampered", Signature: signature },
        certPem,
      ),
      false,
      "a signature valid for the original body must not verify a tampered one",
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
