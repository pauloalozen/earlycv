import assert from "node:assert/strict";
import { test } from "node:test";

import type { PaymentListRecord } from "./admin-payments-api";

test("payment list record type is strictly financial", () => {
  const record: PaymentListRecord = {
    checkoutId: "chk_1",
    type: "plan",
    userId: "usr_1",
    userEmail: "user@example.com",
    planName: "Starter",
    status: "completed",
    mpPaymentId: "mp_1",
    mpPreferenceId: "pref_1",
    externalReference: "ext_1",
    amountInCents: 1990,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  assert.equal(record.type, "plan");
});
