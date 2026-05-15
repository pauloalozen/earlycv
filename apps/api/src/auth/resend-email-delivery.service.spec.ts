import assert from "node:assert/strict";
import { mock, test } from "node:test";

import { Logger } from "@nestjs/common";

import { ResendEmailDeliveryService } from "./resend-email-delivery.service";

test("ResendEmailDeliveryService does not log raw provider body on HTTP error", async () => {
  const service = new ResendEmailDeliveryService();
  const providerBody = '{"error":"invalid","to":"candidate@example.com","subject":"reset"}';

  const text = mock.fn(async () => providerBody);
  const fetchMock = mock.method(globalThis, "fetch", async () => {
    return {
      ok: false,
      status: 503,
      headers: new Headers({ "x-request-id": "req_abc123" }),
      text,
    } as unknown as Response;
  });
  const loggerError = mock.method(Logger.prototype, "error", () => {});

  try {
    await assert.rejects(
      service.send({
        to: "candidate@example.com",
        subject: "Reset password",
        text: "Reset link",
      }),
      /Failed to send email via Resend: 503/,
    );

    assert.equal(fetchMock.mock.calls.length, 1);
    assert.equal(text.mock.calls.length, 0);
    assert.equal(loggerError.mock.calls.length, 1);
    assert.deepEqual(loggerError.mock.calls[0]?.arguments, [
      "Resend email delivery failed",
      {
        provider: "resend",
        operation: "email_send",
        status: "failure",
        errorCode: "HTTP_503",
        requestId: "req_abc123",
      },
    ]);
  } finally {
    fetchMock.mock.restore();
    loggerError.mock.restore();
  }
});
