import assert from "node:assert/strict";
import { test } from "node:test";

import {
  isRemoteOnlyLocation,
  withNormalizedLocation,
} from "./location-normalization";
import type { NormalizedJobObservation } from "./types";

function observation(
  overrides: Partial<NormalizedJobObservation>,
): NormalizedJobObservation {
  return {
    canonicalKey: "gupy:acme:1",
    descriptionClean: "desc",
    descriptionRaw: "<p>desc</p>",
    firstSeenAt: "2026-10-01T00:00:00.000Z",
    lastSeenAt: "2026-10-01T00:00:00.000Z",
    locationText: "",
    normalizedTitle: "dev",
    sourceJobUrl: "https://acme.gupy.io/1",
    title: "Dev",
    ...overrides,
  };
}

test("isRemoteOnlyLocation só aceita texto que é só remoto", () => {
  for (const text of [
    "Remote",
    "Remoto",
    "100% Remoto",
    "Remote, Brazil",
    "Brazil - Remote",
    "Home Office",
    "Teletrabalho",
  ]) {
    assert.equal(isRemoteOnlyLocation(text), true, text);
  }
  for (const text of [
    "Brasil",
    "Remote, Global",
    "São Paulo ou Teletrabalho",
    "Remote, AMER",
    "",
  ]) {
    assert.equal(isRemoteOnlyLocation(text), false, text);
  }
});

test("withNormalizedLocation preenche cidade/UF e corrige workModel de remoto puro", () => {
  const filled = withNormalizedLocation(
    observation({ country: "Brazil", locationText: "Brazil - Sao Paulo" }),
  );
  assert.equal(filled.city, "São Paulo");
  assert.equal(filled.state, "SP");

  const remote = withNormalizedLocation(
    observation({ country: "Brasil", locationText: "Remote" }),
  );
  assert.equal(remote.workModel, "remote");
  assert.equal(remote.city, undefined);

  const hybrid = withNormalizedLocation(
    observation({ locationText: "Remote", workModel: "hybrid" }),
  );
  assert.equal(hybrid.workModel, "hybrid");

  const kept = withNormalizedLocation(
    observation({
      city: "Barra Funda",
      locationText: "Barra Funda, SP",
      state: "SP",
    }),
  );
  assert.equal(kept.city, "Barra Funda");
  assert.equal(kept.state, "SP");
});
