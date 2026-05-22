import "reflect-metadata";

import assert from "node:assert/strict";
import { test } from "node:test";

import { GUARDS_METADATA } from "@nestjs/common/constants";
import { JwtAuthGuard } from "../common/jwt-auth.guard";
import { PaymentRecoveryPublicController } from "./payment-recovery-public.controller";

test("public controller is thin and delegates click orchestration", async () => {
  let called = false;
  const controller = new PaymentRecoveryPublicController({
    handleTokenClick: async () => {
      called = true;
      return { redirectUrl: "/x", redirectTarget: "generic" };
    },
  } as any,
  { resumeCheckoutForToken: async () => ({ checkoutUrl: "https://checkout.example" }) } as any);

  const response = {
    redirect: (url: string) => {
      assert.equal(url, "/x");
    },
  } as any;

  await controller.recover(
    "a".repeat(64),
    undefined,
    { ip: "1.1.1.1", headers: { "user-agent": "UA" } } as any,
    response,
  );

  assert.equal(called, true);
});

test("public click endpoint enforces optional auth and rate limit guards", () => {
  const guards = Reflect.getMetadata(
    GUARDS_METADATA,
    PaymentRecoveryPublicController.prototype.recover,
  ) ?? [];
  assert.equal(Array.isArray(guards), true);
  assert.equal(guards.length, 2);
});

test("bridge endpoint requires jwt auth guard", () => {
  const guards = Reflect.getMetadata(
    GUARDS_METADATA,
    PaymentRecoveryPublicController.prototype.resumeBridge,
  ) ?? [];
  assert.equal(guards.includes(JwtAuthGuard), true);
});

test("bridge endpoint delegates to resume service and redirects", async () => {
  const controller = new PaymentRecoveryPublicController(
    { handleTokenClick: async () => ({ redirectUrl: "/x", redirectTarget: "generic" }) } as any,
    { resumeCheckoutForToken: async () => ({ checkoutUrl: "https://checkout.example/path" }) } as any,
  );
  let redirected = "";
  await controller.resumeBridge(
    "a".repeat(64),
    { id: "user-1" },
    { ip: "1.1.1.1", headers: { "user-agent": "UA" } } as any,
    { redirect: (url: string) => (redirected = url) } as any,
  );
  assert.equal(redirected, "https://checkout.example/path");
});
