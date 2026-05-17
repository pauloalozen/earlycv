import assert from "node:assert/strict";
import { test } from "node:test";

import { buildPublicJobSlug } from "./public-job-view";

test("buildPublicJobSlug creates stable slug with job id suffix", () => {
  assert.equal(
    buildPublicJobSlug("cmp_job123", "Pessoa Engenheira de Dados", "Itau"),
    "pessoa-engenheira-de-dados-itau-cmp-job123",
  );
});
