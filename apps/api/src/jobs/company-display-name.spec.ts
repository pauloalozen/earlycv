import assert from "node:assert/strict";
import { test } from "node:test";

import { formatCompanyDisplayName } from "./company-display-name";

test("title-cases an all-caps name", () => {
  assert.equal(
    formatCompanyDisplayName("TIVIT TERCEIRIZAÇÃO DE PROCESSOS"),
    "Tivit Terceirização De Processos",
  );
});

test("title-cases a lowercase name", () => {
  assert.equal(formatCompanyDisplayName("magazine luiza"), "Magazine Luiza");
});

test("leaves an already correctly-cased name unchanged", () => {
  assert.equal(formatCompanyDisplayName("Nubank"), "Nubank");
});

test("collapses a short all-caps acronym to title case too", () => {
  assert.equal(formatCompanyDisplayName("XP INVESTIMENTOS"), "Xp Investimentos");
});

test("strips a stray leading quote glued to the first word", () => {
  assert.equal(
    formatCompanyDisplayName('"tivit Terceirizacao De Processos'),
    "Tivit Terceirizacao De Processos",
  );
});

test("strips curly quotes and collapses extra whitespace", () => {
  assert.equal(
    formatCompanyDisplayName("“Nubank”   pagamentos"),
    "Nubank Pagamentos",
  );
});
