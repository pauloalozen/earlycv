import assert from "node:assert/strict";
import { test } from "node:test";

import { computeMonitorMatchFingerprint } from "./monitor-profile-fingerprint";

function buildProfile(overrides: Record<string, unknown> = {}) {
  return {
    areas: ["SOFTWARE_ENGINEERING"],
    skills: ["typescript", "node"],
    technologies: ["react"],
    seniority: "SENIOR",
    languages: ["ingles"],
    preferredWorkModels: ["remote"],
    ...overrides,
  } as never;
}

test("computeMonitorMatchFingerprint is stable for the same profile", () => {
  const a = computeMonitorMatchFingerprint(buildProfile());
  const b = computeMonitorMatchFingerprint(buildProfile());
  assert.equal(a, b);
});

test("computeMonitorMatchFingerprint is order-independent (array order doesn't change the version)", () => {
  const a = computeMonitorMatchFingerprint(
    buildProfile({ skills: ["typescript", "node"] }),
  );
  const b = computeMonitorMatchFingerprint(
    buildProfile({ skills: ["node", "typescript"] }),
  );
  assert.equal(a, b);
});

test("computeMonitorMatchFingerprint changes when a matching-relevant field changes", () => {
  const base = computeMonitorMatchFingerprint(buildProfile());
  const changedArea = computeMonitorMatchFingerprint(
    buildProfile({ areas: ["DATA_AI"] }),
  );
  const changedSeniority = computeMonitorMatchFingerprint(
    buildProfile({ seniority: "JUNIOR" }),
  );
  const changedSkills = computeMonitorMatchFingerprint(
    buildProfile({ skills: ["python"] }),
  );

  assert.notEqual(base, changedArea);
  assert.notEqual(base, changedSeniority);
  assert.notEqual(base, changedSkills);
});

test("computeMonitorMatchFingerprint ignores fields MatchingEngine.calculateScore doesn't consume", () => {
  // O tipo de entrada só aceita os campos relevantes — este teste documenta
  // a intenção: um objeto com campos extras (certifications,
  // preferredContractTypes, openToRelocation) não deveria fazer parte do
  // hash. Simulamos isso passando o mesmo profile "relevante" duas vezes,
  // uma delas embutida num objeto com campos extras — o hash deve ser igual
  // porque computeMonitorMatchFingerprint só lê os 6 campos declarados.
  const relevant = buildProfile();
  const withExtraFields = {
    ...relevant,
    certifications: ["AWS Certified"],
    preferredContractTypes: ["PJ"],
    openToRelocation: true,
    careerFingerprint: ["Engenheiro"],
  };

  assert.equal(
    computeMonitorMatchFingerprint(relevant),
    computeMonitorMatchFingerprint(withExtraFields as never),
  );
});
