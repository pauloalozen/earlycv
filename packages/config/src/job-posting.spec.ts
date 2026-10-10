import assert from "node:assert/strict";
import test from "node:test";

import { shouldEmitJobPosting } from "./job-posting.js";

const base = {
  city: "São Paulo",
  country: "Brasil",
  employmentType: "clt",
  state: "SP",
  workModel: "onsite",
};

test("shouldEmitJobPosting: vaga do Brasil com localização ou remota", () => {
  assert.equal(shouldEmitJobPosting(base), true);
  assert.equal(
    shouldEmitJobPosting({ ...base, city: null, state: null }),
    true,
    "não remota sem cidade: jobLocation só com o país",
  );
  assert.equal(
    shouldEmitJobPosting({
      ...base,
      city: null,
      state: null,
      workModel: "remote",
    }),
    true,
  );
});

test("shouldEmitJobPosting: banco de talentos nunca tem JobPosting", () => {
  assert.equal(
    shouldEmitJobPosting({ ...base, employmentType: "talent_pool" }),
    false,
  );
  assert.equal(
    shouldEmitJobPosting({ ...base, employmentType: "Talent Pool" }),
    false,
  );
});

test("shouldEmitJobPosting: vaga sem localização ou estrangeira fica sem", () => {
  assert.equal(
    shouldEmitJobPosting({
      ...base,
      city: null,
      country: null,
      state: null,
    }),
    false,
  );
  assert.equal(
    shouldEmitJobPosting({
      ...base,
      city: null,
      country: null,
      state: null,
      workModel: "remote",
    }),
    false,
  );
  assert.equal(
    shouldEmitJobPosting({
      ...base,
      city: "Austin",
      country: "USA",
      state: "TX",
    }),
    false,
  );
});
