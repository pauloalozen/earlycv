import assert from "node:assert/strict";
import { test } from "node:test";

import { stripNormalizedJobIdPrefix, withCleanTitle } from "./clean-title";
import type { NormalizedJobObservation } from "./types";

function observation(
  overrides: Partial<NormalizedJobObservation>,
): NormalizedJobObservation {
  return {
    canonicalKey: "lever:ciandt:1",
    descriptionClean: "desc",
    descriptionRaw: "<p>desc</p>",
    firstSeenAt: "2026-10-01T00:00:00.000Z",
    lastSeenAt: "2026-10-01T00:00:00.000Z",
    locationText: "Campinas",
    normalizedTitle: "job-32186 senior ai developer",
    sourceJobUrl: "https://jobs.lever.co/ciandt/1",
    title: "[Job-32186] Senior AI Developer",
    ...overrides,
  };
}

test("withCleanTitle tira o [Job-N] do título e do normalizedTitle", () => {
  const clean = withCleanTitle(observation({}));
  assert.equal(clean.title, "Senior AI Developer");
  assert.equal(clean.normalizedTitle, "senior ai developer");
});

test("withCleanTitle devolve a mesma observação quando não há prefixo", () => {
  const input = observation({
    normalizedTitle: "senior ai developer",
    title: "Senior AI Developer",
  });
  assert.equal(withCleanTitle(input), input);
});

test("stripNormalizedJobIdPrefix cobre o normalizedTitle com ou sem colchetes", () => {
  assert.equal(stripNormalizedJobIdPrefix("[job-1] dev"), "dev");
  assert.equal(stripNormalizedJobIdPrefix("job-1 dev"), "dev");
  assert.equal(
    stripNormalizedJobIdPrefix("job 29685 ai orchestrator"),
    "ai orchestrator",
  );
  assert.equal(
    stripNormalizedJobIdPrefix("job - 30678 c developer"),
    "c developer",
  );
  assert.equal(stripNormalizedJobIdPrefix("dev job-1"), "dev job-1");
});
