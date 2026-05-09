import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildMercadoPagoItemMetadata,
  buildMercadoPagoReturnConfig,
} from "./mercado-pago-return-config";

test("buildMercadoPagoReturnConfig enables auto_return for https success url", () => {
  const result = buildMercadoPagoReturnConfig({
    frontendUrl: "https://earlycv.com.br",
    successPath: "/pagamento/concluido?checkoutId=abc",
    failurePath: "/pagamento/falhou?checkoutId=abc",
    pendingPath: "/pagamento/pendente?checkoutId=abc",
  });

  assert.deepEqual(result.backUrls, {
    success: "https://earlycv.com.br/pagamento/concluido?checkoutId=abc",
    failure: "https://earlycv.com.br/pagamento/falhou?checkoutId=abc",
    pending: "https://earlycv.com.br/pagamento/pendente?checkoutId=abc",
  });
  assert.equal(result.autoReturn, "approved");
  assert.equal(result.successUrlIsHttps, true);
  assert.equal(result.autoReturnEnabled, true);
});

test("buildMercadoPagoReturnConfig keeps back_urls and disables auto_return on non-https", () => {
  const result = buildMercadoPagoReturnConfig({
    frontendUrl: "http://localhost:3000",
    successPath: "/pagamento/concluido?checkoutId=abc",
    failurePath: "/pagamento/falhou?checkoutId=abc",
    pendingPath: "/pagamento/pendente?checkoutId=abc",
  });

  assert.deepEqual(result.backUrls, {
    success: "http://localhost:3000/pagamento/concluido?checkoutId=abc",
    failure: "http://localhost:3000/pagamento/falhou?checkoutId=abc",
    pending: "http://localhost:3000/pagamento/pendente?checkoutId=abc",
  });
  assert.equal(result.autoReturn, undefined);
  assert.equal(result.successUrlIsHttps, false);
  assert.equal(result.autoReturnEnabled, false);
});

test("buildMercadoPagoItemMetadata returns category_id and description for cv_adaptation", () => {
  const result = buildMercadoPagoItemMetadata({ flow: "cv_adaptation" });

  assert.equal(result.category_id, "services");
  assert.equal(result.description, "Liberacao de CV adaptado no EarlyCV");
});

test("buildMercadoPagoItemMetadata returns category_id and description for plan_purchase", () => {
  const result = buildMercadoPagoItemMetadata({
    flow: "plan_purchase",
    planLabel: "Pro",
  });

  assert.equal(result.category_id, "services");
  assert.equal(result.description, "Compra de creditos no EarlyCV - Pro");
});

test("buildMercadoPagoItemMetadata trims planLabel and falls back to Plano", () => {
  const trimmed = buildMercadoPagoItemMetadata({
    flow: "plan_purchase",
    planLabel: "  Pro  ",
  });
  assert.equal(trimmed.description, "Compra de creditos no EarlyCV - Pro");

  const fallback = buildMercadoPagoItemMetadata({
    flow: "plan_purchase",
    planLabel: "",
  });
  assert.equal(fallback.description, "Compra de creditos no EarlyCV - Plano");
});
