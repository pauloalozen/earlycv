import assert from "node:assert/strict";
import { test } from "node:test";

import { TurnstileVerificationService } from "./turnstile-verification.service";
import type { AnalysisRequestContext } from "./types";

const context: AnalysisRequestContext = {
  correlationId: "corr-1",
  ip: "203.0.113.10",
  requestId: "req-1",
  sessionInternalId: "session-1",
  sessionPublicToken: null,
  userId: null,
};

const withEnv = async (
  values: Record<string, string | undefined>,
  run: () => Promise<void>,
) => {
  const previous = new Map<string, string | undefined>();

  for (const [key, value] of Object.entries(values)) {
    previous.set(key, process.env[key]);

    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  try {
    await run();
  } finally {
    for (const [key, value] of previous.entries()) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
};

test("returns turnstile_missing when token is empty", async () => {
  const service = new TurnstileVerificationService(async () => {
    throw new Error("fetch should not be called");
  });

  const decision = await service.verifyToken("   ", context);

  assert.deepEqual(decision, { valid: false, reason: "turnstile_missing" });
});

test("allows token when skip verification env flag is true", async () => {
  await withEnv({ SKIP_TURNSTILE_VERIFICATION: "true" }, async () => {
    const service = new TurnstileVerificationService(async () => {
      throw new Error("fetch should not be called");
    });

    const decision = await service.verifyToken("token", context);

    assert.deepEqual(decision, { valid: true, reason: null });
  });
});

test("returns turnstile_unconfigured when secret env is absent", async () => {
  await withEnv(
    {
      CLOUDFLARE_TURNSTILE_SECRET_KEY: undefined,
      SKIP_TURNSTILE_VERIFICATION: undefined,
      TURNSTILE_SECRET: undefined,
      TURNSTILE_SECRET_KEY: undefined,
    },
    async () => {
      const service = new TurnstileVerificationService(async () => {
        throw new Error("fetch should not be called");
      });

      const decision = await service.verifyToken("token", context);

      assert.deepEqual(decision, {
        valid: false,
        reason: "turnstile_unconfigured",
      });
    },
  );
});

test("returns turnstile_unconfigured when configured secret is only whitespace", async () => {
  await withEnv(
    {
      CLOUDFLARE_TURNSTILE_SECRET_KEY: "   ",
      SKIP_TURNSTILE_VERIFICATION: undefined,
      TURNSTILE_SECRET: undefined,
      TURNSTILE_SECRET_KEY: undefined,
    },
    async () => {
      const service = new TurnstileVerificationService(async () => {
        throw new Error("fetch should not be called");
      });

      const decision = await service.verifyToken("token", context);

      assert.deepEqual(decision, {
        valid: false,
        reason: "turnstile_unconfigured",
      });
    },
  );
});

test("trims secret before sending verification payload", async () => {
  await withEnv(
    {
      CLOUDFLARE_TURNSTILE_SECRET_KEY: undefined,
      SKIP_TURNSTILE_VERIFICATION: undefined,
      TURNSTILE_SECRET: undefined,
      TURNSTILE_SECRET_KEY: "  secret-with-spaces  ",
    },
    async () => {
      let capturedSecret: string | null = null;

      const service = new TurnstileVerificationService(async (_url, init) => {
        capturedSecret = (init?.body as URLSearchParams).get("secret");
        return {
          ok: true,
          json: async () => ({ success: true }),
        } as Response;
      });

      const decision = await service.verifyToken("token", context);

      assert.deepEqual(decision, { valid: true, reason: null });
      assert.equal(capturedSecret, "secret-with-spaces");
    },
  );
});

test("returns turnstile_unavailable on non-2xx verification response", async () => {
  await withEnv({ TURNSTILE_SECRET_KEY: "secret" }, async () => {
    const service = new TurnstileVerificationService(
      async () =>
        ({
          ok: false,
          json: async () => ({}),
        }) as Response,
    );

    const decision = await service.verifyToken("token", context);

    assert.deepEqual(decision, {
      valid: false,
      reason: "turnstile_unavailable",
    });
  });
});

test("returns turnstile_invalid when siteverify payload reports failure", async () => {
  await withEnv({ TURNSTILE_SECRET_KEY: "secret" }, async () => {
    const service = new TurnstileVerificationService(
      async () =>
        ({
          ok: true,
          json: async () => ({ success: false }),
        }) as Response,
    );

    const decision = await service.verifyToken("token", context);

    assert.deepEqual(decision, { valid: false, reason: "turnstile_invalid" });
  });
});

test("returns turnstile_expired when challenge timestamp is too old", async () => {
  await withEnv({ TURNSTILE_SECRET_KEY: "secret" }, async () => {
    const now = new Date("2026-04-21T12:00:00.000Z").valueOf();
    const challengeTs = "2026-04-21T11:58:00.000Z";

    const service = new TurnstileVerificationService(
      async () =>
        ({
          ok: true,
          json: async () => ({ challenge_ts: challengeTs, success: true }),
        }) as Response,
      () => now,
    );

    const decision = await service.verifyToken("token", context, {
      maxTokenAgeMs: 30_000,
    });

    assert.deepEqual(decision, { valid: false, reason: "turnstile_expired" });
  });
});

test("returns valid decision when verification succeeds within token age", async () => {
  await withEnv({ TURNSTILE_SECRET_KEY: "secret" }, async () => {
    const now = new Date("2026-04-21T12:00:00.000Z").valueOf();
    const challengeTs = "2026-04-21T11:59:50.000Z";

    const service = new TurnstileVerificationService(
      async () =>
        ({
          ok: true,
          json: async () => ({ challenge_ts: challengeTs, success: true }),
        }) as Response,
      () => now,
    );

    const decision = await service.verifyToken("token", context, {
      maxTokenAgeMs: 30_000,
    });

    assert.deepEqual(decision, { valid: true, reason: null });
  });
});

test("returns turnstile_invalid when expected action does not match", async () => {
  await withEnv({ TURNSTILE_SECRET_KEY: "secret" }, async () => {
    const service = new TurnstileVerificationService(
      async () =>
        ({
          ok: true,
          json: async () => ({ action: "analysis/upload", success: true }),
        }) as Response,
    );

    const decision = await service.verifyToken("token", context, {
      expectedAction: "analysis/score-resume",
    });

    assert.deepEqual(decision, { valid: false, reason: "turnstile_invalid" });
  });
});
