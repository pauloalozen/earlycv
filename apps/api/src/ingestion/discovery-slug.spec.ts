import assert from "node:assert/strict";
import { test } from "node:test";
import { generateSlugVariants } from "./discovery-slug";

test("generateSlugVariants tenta cada palavra significativa isolada, não só a primeira", () => {
  // Regressão: "Banco Agibank" só gerava variantes com "banco" como
  // primeira palavra (bancoagibank, banco-agibank, banco) — nunca
  // "agibank" isolado, que é o slug real da empresa.
  const variants = generateSlugVariants("Banco Agibank");
  assert.ok(variants.includes("agibank"));
  assert.ok(variants.includes("banco"));
  assert.ok(variants.includes("bancoagibank"));
});

test("generateSlugVariants: nome de 1 palavra só gera a própria palavra", () => {
  const variants = generateSlugVariants("Superlogica");
  assert.deepEqual(variants, ["superlogica"]);
});

test("generateSlugVariants ignora palavras de ruído (S.A., Ltda...)", () => {
  const variants = generateSlugVariants("Empresa Exemplo S.A.");
  assert.ok(!variants.includes("sa"));
  assert.ok(variants.includes("empresa"));
  assert.ok(variants.includes("exemplo"));
});
