import assert from "node:assert/strict";
import { test } from "node:test";

import { ProductUpdateEmailService } from "./product-update-email.service";

function setup(suppressed: boolean) {
  const sent: unknown[] = [];
  const database = {
    productUpdateDelivery: {
      findUnique: async () => ({
        id: "d1",
        recipientEmail: "maria@example.com",
        productUpdate: {
          id: "pu1",
          subject: "Novidade",
          htmlSnapshot: "<p>oi</p>",
          textSnapshot: "oi",
        },
      }),
    },
  };
  const emailService = {
    send: async (params: unknown) => {
      sent.push(params);
      return { outcome: "SENT", provider: "SES", providerMessageId: "m1" };
    },
  };
  const service = new ProductUpdateEmailService(
    database as never,
    emailService as never,
    {} as never,
    {
      AWS_SES_CONTACT_LIST_NAME: "list",
      AWS_SES_PRODUCT_UPDATE_TOPIC_NAME: "product-updates",
    },
    {
      findByEmail: async () => (suppressed ? { reason: "HARD_BOUNCE" } : null),
    },
  );
  return { service, sent };
}

test("sendToDelivery never sends to an address with a shared hard bounce/complaint", async () => {
  const { service, sent } = setup(true);

  assert.deepEqual(await service.sendToDelivery("d1"), {
    sent: false,
    skippedReason: "email_suppressed",
  });
  assert.equal(sent.length, 0);
});

test("sendToDelivery still sends (with the PRODUCT topic only) when the address is not suppressed", async () => {
  const { service, sent } = setup(false);

  const result = await service.sendToDelivery("d1");

  assert.equal(result.sent, true);
  assert.equal(sent.length, 1);
  assert.deepEqual(
    (sent[0] as { message: { listManagementOptions: unknown } }).message
      .listManagementOptions,
    { contactListName: "list", topicName: "product-updates" },
  );
});
