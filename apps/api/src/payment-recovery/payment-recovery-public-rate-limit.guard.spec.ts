import assert from "node:assert/strict";
import { test } from "node:test";

import { TooManyRequestsException } from "@nestjs/common";
import { PaymentRecoveryPublicRateLimitGuard } from "./payment-recovery-public-rate-limit.guard";

test("rate limit guard allows requests below threshold", async () => {
  const guard = new PaymentRecoveryPublicRateLimitGuard({
    publicRateLimitPerMinute: () => 2,
  } as any);
  const context = {
    switchToHttp: () => ({ getRequest: () => ({ ip: "1.1.1.1" }) }),
  } as any;

  assert.equal(await guard.canActivate(context), true);
  assert.equal(await guard.canActivate(context), true);
});

test("rate limit guard blocks requests above threshold", async () => {
  const guard = new PaymentRecoveryPublicRateLimitGuard({
    publicRateLimitPerMinute: () => 1,
  } as any);
  const context = {
    switchToHttp: () => ({ getRequest: () => ({ ip: "1.1.1.2" }) }),
  } as any;

  await guard.canActivate(context);
  await assert.rejects(async () => guard.canActivate(context), TooManyRequestsException);
});
