import assert from "node:assert/strict";
import { test } from "node:test";
import type { ExecutionContext } from "@nestjs/common";
import { TooManyRequestsException } from "@nestjs/common";
import { PaymentRecoveryPublicRateLimitGuard } from "./payment-recovery-public-rate-limit.guard";

test("rate limit guard allows requests below threshold", async () => {
  const guard = new PaymentRecoveryPublicRateLimitGuard({
    publicRateLimitPerMinute: () => 2,
  } as unknown as ConstructorParameters<
    typeof PaymentRecoveryPublicRateLimitGuard
  >[0]);
  const context = {
    switchToHttp: () => ({ getRequest: () => ({ ip: "1.1.1.1" }) }),
  } as unknown as ExecutionContext;

  assert.equal(await guard.canActivate(context), true);
  assert.equal(await guard.canActivate(context), true);
});

test("rate limit guard blocks requests above threshold", async () => {
  const guard = new PaymentRecoveryPublicRateLimitGuard({
    publicRateLimitPerMinute: () => 1,
  } as unknown as ConstructorParameters<
    typeof PaymentRecoveryPublicRateLimitGuard
  >[0]);
  const context = {
    switchToHttp: () => ({ getRequest: () => ({ ip: "1.1.1.2" }) }),
  } as unknown as ExecutionContext;

  await guard.canActivate(context);
  await assert.rejects(
    async () => guard.canActivate(context),
    TooManyRequestsException,
  );
});
