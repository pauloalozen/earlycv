import assert from "node:assert/strict";
import { test } from "node:test";

import { ProfileReadinessService } from "./profile-readiness.service";

const service = new ProfileReadinessService();

test("returns ready only with minimum required fields", () => {
  const status = service.compute({
    fullName: "A",
    experiences: [{ id: "exp_1" }],
    education: [],
    skills: {
      technical: ["SQL"],
      business: [],
      soft: [],
    },
  });

  assert.equal(status, "ready");
});

test("returns partial with some curriculum data but below threshold", () => {
  const status = service.compute({
    experiences: [],
    education: [],
    skills: {
      technical: ["SQL"],
      business: [],
      soft: [],
    },
  });

  assert.equal(status, "partial");
});

test("returns empty when no useful curriculum data", () => {
  const status = service.compute({
    experiences: [],
    education: [],
    skills: {
      technical: [],
      business: [],
      soft: [],
    },
  });

  assert.equal(status, "empty");
});
