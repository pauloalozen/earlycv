import assert from "node:assert/strict";
import { mock, test } from "node:test";

import { Logger } from "@nestjs/common";

import { ResendEmailDeliveryService } from "./resend-email-delivery.service";

test("ResendEmailDeliveryService logs safe structured metadata on provider error", async () => {
  const originalFetch = globalThis.fetch;
  const fetchMock = mock.fn(async () => {
    return new Response('{"error":"provider payload"}', {
      status: 429,
      headers: {
        "x-request-id": "req_123",
      },
    });
  });
  const loggerErrorMock = mock.method(Logger.prototype, "error", () => {});

  globalThis.fetch = fetchMock as typeof globalThis.fetch;

  try {
    const service = new ResendEmailDeliveryService();

    await assert.rejects(
      service.send({
        to: "ana@example.com",
        subject: "Subject sigiloso",
        text: "Corpo sigiloso",
      }),
      /Failed to send email via Resend: 429/,
    );

    assert.equal(loggerErrorMock.mock.calls.length, 1);
    const [message, metadata] = loggerErrorMock.mock.calls[0]?.arguments ?? [];
    assert.equal(message, "Email delivery failed");
    assert.equal(typeof metadata, "object");
    assert.equal(metadata?.provider, "resend");
    assert.equal(metadata?.operation, "email_send");
    assert.equal(metadata?.status, "failure");
    assert.equal(metadata?.errorCode, "HTTP_429");
    assert.equal(metadata?.requestId, "req_123");
    assert.equal("body" in (metadata ?? {}), false);
    assert.equal("payload" in (metadata ?? {}), false);
    assert.equal(JSON.stringify(metadata).includes("provider payload"), false);
    assert.equal(JSON.stringify(metadata).includes("ana@example.com"), false);
    assert.equal(JSON.stringify(metadata).includes("Subject sigiloso"), false);
    assert.equal(JSON.stringify(metadata).includes("Corpo sigiloso"), false);
  } finally {
    loggerErrorMock.mock.restore();
    globalThis.fetch = originalFetch;
  }
});

test("ResendEmailDeliveryService logs safe structured metadata on success", async () => {
  const originalFetch = globalThis.fetch;
  const fetchMock = mock.fn(async () => {
    return new Response('{"id":"email_123"}', {
      status: 200,
      headers: {
        "x-request-id": "req_success_123",
      },
    });
  });
  const loggerLogMock = mock.method(Logger.prototype, "log", () => {});

  globalThis.fetch = fetchMock as typeof globalThis.fetch;

  try {
    const service = new ResendEmailDeliveryService();
    await service.send({
      to: "bia@example.com",
      subject: "Assunto interno",
      text: "Conteudo interno",
      html: "<p>Conteudo interno</p>",
    });

    assert.equal(loggerLogMock.mock.calls.length, 1);
    const [message, metadata] = loggerLogMock.mock.calls[0]?.arguments ?? [];
    assert.equal(message, "Email delivery succeeded");
    assert.equal(typeof metadata, "object");
    assert.equal(metadata?.provider, "resend");
    assert.equal(metadata?.operation, "email_send");
    assert.equal(metadata?.status, "success");
    assert.equal(metadata?.messageId, "email_123");
    assert.equal(metadata?.requestId, "req_success_123");
    assert.equal(JSON.stringify(metadata).includes("bia@example.com"), false);
    assert.equal(JSON.stringify(metadata).includes("Assunto interno"), false);
    assert.equal(JSON.stringify(metadata).includes("Conteudo interno"), false);
  } finally {
    loggerLogMock.mock.restore();
    globalThis.fetch = originalFetch;
  }
});
