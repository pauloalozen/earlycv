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
