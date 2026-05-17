import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveEmitPayload } from "./admin-events-emit-payload.ts";
import { getAdminNavItems } from "./admin-users-operations.ts";

test("admin nav includes eventos e logs route", () => {
  const item = getAdminNavItems().find(
    (navItem) => navItem.href === "/admin/eventos-e-logs",
  );

  assert.equal(item?.href, "/admin/eventos-e-logs");
  assert.equal(item?.label, "Eventos e logs");
  assert.equal(item?.phase, "fase 4");
});

test("admin nav includes liberacoes de cv route", () => {
  const item = getAdminNavItems().find(
    (navItem) => navItem.href === "/admin/liberacoes-cv",
  );

  assert.equal(item?.href, "/admin/liberacoes-cv");
  assert.equal(item?.label, "Liberacoes de CV");
});

test("resolveEmitPayload returns expected payload for single mode", () => {
  const formData = new FormData();
  formData.set("mode", "single");
  formData.set("eventName", "page_view");

  assert.deepEqual(resolveEmitPayload(formData), {
    eventName: "page_view",
    mode: "single",
  });
});

test("resolveEmitPayload rejects invalid single mode payload", () => {
  const formData = new FormData();
  formData.set("mode", "single");

  assert.throws(() => resolveEmitPayload(formData), {
    message: "eventName is required for single mode",
  });
});

test("resolveEmitPayload returns expected payload for group mode", () => {
  const formData = new FormData();
  formData.set("mode", "group");
  formData.set("group", "protection");

  assert.deepEqual(resolveEmitPayload(formData), {
    group: "protection",
    mode: "group",
  });
});

test("resolveEmitPayload rejects invalid group payload", () => {
  const formData = new FormData();
  formData.set("mode", "group");
  formData.set("group", "invalid");

  assert.throws(() => resolveEmitPayload(formData), {
    message: "Grupo invalido para disparo.",
  });
});

test("resolveEmitPayload rejects unknown mode", () => {
  const formData = new FormData();
  formData.set("mode", "something-else");

  assert.throws(() => resolveEmitPayload(formData), {
    message: "Modo invalido para disparo.",
  });
});
