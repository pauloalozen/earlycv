import assert from "node:assert/strict";
import { test } from "node:test";

import { GUARDS_METADATA } from "@nestjs/common/constants";

import { JwtAuthGuard } from "../common/jwt-auth.guard";
import { PaymentsController } from "./payments.controller";

test("PaymentsController keeps JwtAuthGuard at class level", () => {
  const guards = Reflect.getMetadata(GUARDS_METADATA, PaymentsController) as
    | Array<new (...args: unknown[]) => unknown>
    | undefined;

  assert.ok(Array.isArray(guards));
  assert.ok(guards.includes(JwtAuthGuard));
});
