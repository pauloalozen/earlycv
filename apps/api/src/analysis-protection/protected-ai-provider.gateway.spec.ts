import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ProtectedAiProviderGateway,
  ProtectedAiProviderGatewayError,
} from "./protected-ai-provider.gateway";

test("returns provider result when execution is within limits", async () => {
  const gateway = new ProtectedAiProviderGateway();

  const result = await gateway.execute(async () => ({ adapted: true }), {
    maxExecutionMs: 500,
    timeoutMs: 500,
  });

  assert.deepEqual(result, { adapted: true });
});

test("throws provider_timeout when provider hangs beyond timeout", async () => {
  const gateway = new ProtectedAiProviderGateway();

  await assert.rejects(
    gateway.execute(
      async () =>
        await new Promise<never>(() => {
          // intentionally unresolved
        }),
      {
        maxExecutionMs: 1_000,
        timeoutMs: 10,
      },
    ),
    (error: unknown) => {
      assert.equal(error instanceof ProtectedAiProviderGatewayError, true);
      assert.equal(
        (error as ProtectedAiProviderGatewayError).code,
        "provider_timeout",
      );
      return true;
    },
  );
});

test("throws provider_max_execution_exceeded when elapsed time exceeds budget", async () => {
  const nowValues = [100, 250];
  const gateway = new ProtectedAiProviderGateway(
    () => nowValues.shift() ?? 250,
  );

  await assert.rejects(
    gateway.execute(async () => ({ adapted: true }), {
      maxExecutionMs: 100,
      timeoutMs: 1_000,
    }),
    (error: unknown) => {
      assert.equal(error instanceof ProtectedAiProviderGatewayError, true);
      assert.equal(
        (error as ProtectedAiProviderGatewayError).code,
        "provider_max_execution_exceeded",
      );
      return true;
    },
  );
});
