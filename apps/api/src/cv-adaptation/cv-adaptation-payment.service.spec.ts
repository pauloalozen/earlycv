import assert from "node:assert/strict";
import { mock, test } from "node:test";

import { Preference } from "mercadopago";

import { CvAdaptationPaymentService } from "./cv-adaptation-payment.service";

type PreferenceBody = {
  back_urls?: {
    success?: string;
    failure?: string;
    pending?: string;
  };
  auto_return?: string;
  items?: Array<{ category_id?: string; description?: string }>;
};

function withEnv(overrides: Record<string, string>, run: () => Promise<void>) {
  const previous: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(overrides)) {
    previous[key] = process.env[key];
    process.env[key] = value;
  }

  return run().finally(() => {
    for (const key of Object.keys(overrides)) {
      const prior = previous[key];
      if (prior === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = prior;
      }
    }
  });
}

test("createIntent builds MP preference using shared return config", async () => {
  await withEnv(
    {
      PAYMENT_PROVIDER: "mercadopago",
      FRONTEND_URL: "https://earlycv.com.br",
      MERCADOPAGO_ACCESS_TOKEN_TEST: "test-token",
    },
    async () => {
      const service = new CvAdaptationPaymentService();
      let capturedBody: PreferenceBody | null = null;

      const createMock = mock.method(
        Preference.prototype,
        "create",
        async (arg) => {
          capturedBody = (arg as { body: PreferenceBody }).body;

          return {
            id: "pref_123",
            sandbox_init_point: "https://sandbox.mercadopago.com/checkout",
          } as never;
        },
      );

      try {
        await service.createIntent("adapt_abc", "user_1");

        assert.ok(capturedBody);
        assert.deepEqual(capturedBody?.back_urls, {
          success:
            "https://earlycv.com.br/pagamento/concluido?checkoutId=adapt_abc",
          failure: "https://earlycv.com.br/pagamento/falhou?checkoutId=adapt_abc",
          pending:
            "https://earlycv.com.br/pagamento/pendente?checkoutId=adapt_abc",
        });
        assert.equal(capturedBody?.auto_return, "approved");
        assert.equal(capturedBody?.items?.[0]?.category_id, "services");
        assert.match(
          String(capturedBody?.items?.[0]?.description),
          /CV|curriculo|EarlyCV/i,
        );
      } finally {
        createMock.mock.restore();
      }
    },
  );
});

test("createIntent logs warn and skips auto_return for non-https success url", async () => {
  await withEnv(
    {
      PAYMENT_PROVIDER: "mercadopago",
      FRONTEND_URL: "http://localhost:3000",
      MERCADOPAGO_ACCESS_TOKEN_TEST: "test-token",
    },
    async () => {
      const service = new CvAdaptationPaymentService();
      let capturedBody: PreferenceBody | null = null;

      const createMock = mock.method(
        Preference.prototype,
        "create",
        async (arg) => {
          capturedBody = (arg as { body: PreferenceBody }).body;

          return {
            id: "pref_456",
            sandbox_init_point: "https://sandbox.mercadopago.com/checkout",
          } as never;
        },
      );

      const warnMock = mock.method(
        (service as { logger: { warn: (message: string) => void } }).logger,
        "warn",
        () => {},
      );

      try {
        await service.createIntent("adapt_local", "user_1");

        assert.ok(capturedBody);
        assert.equal(capturedBody?.auto_return, undefined);
        assert.equal(warnMock.mock.calls.length, 1);

        const warnMessage = String(warnMock.mock.calls[0]?.arguments[0]);
        assert.match(warnMessage, /flow=cv_adaptation/);
        assert.match(warnMessage, /adaptationId=adapt_local/);
        assert.match(warnMessage, /frontendHost=localhost:3000/);
        assert.match(warnMessage, /successUrlIsHttps=false/);
        assert.match(warnMessage, /autoReturnEnabled=false/);
      } finally {
        warnMock.mock.restore();
        createMock.mock.restore();
      }
    },
  );
});
