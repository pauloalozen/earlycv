import assert from "node:assert/strict";
import { mock, test } from "node:test";

import { FakeEmailDeliveryService } from "./fake-email-delivery.service";

test("FakeEmailDeliveryService logs verification codes in development", async () => {
  const service = new FakeEmailDeliveryService();
  const info = mock.method(console, "info", () => {});

  try {
    await service.send({
      subject: "Seu codigo de verificacao EarlyCV",
      text: "Seu codigo de verificacao e 123456. Ele expira em 15 minutos.",
      to: "teste@example.com",
    });

    assert.equal(info.mock.calls.length, 1);
    assert.match(String(info.mock.calls[0]?.arguments[0]), /123456/);
    assert.match(String(info.mock.calls[0]?.arguments[0]), /teste@example.com/);
  } finally {
    info.mock.restore();
  }
});

test("FakeEmailDeliveryService returns a synthetic providerMessageId (never null) — digest tests can rely on correlation without a real provider", async () => {
  const service = new FakeEmailDeliveryService();
  const info = mock.method(console, "info", () => {});

  try {
    const result = await service.send({
      subject: "Assunto",
      text: "Corpo",
      to: "teste@example.com",
    });

    assert.ok(result.providerMessageId);
    assert.match(result.providerMessageId, /^fake-/);
  } finally {
    info.mock.restore();
  }
});
