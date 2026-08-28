import assert from "node:assert/strict";
import { test } from "node:test";

import { type HeroStateInput, resolveHeroState } from "./hero-state.ts";

const NOW = new Date("2026-08-27T12:00:00.000Z");

function baseInput(overrides: Partial<HeroStateInput> = {}): HeroStateInput {
  return {
    hasAnyApplication: true,
    nearestInterview: null,
    cvReadyUnsubmitted: null,
    hasAvailableCredits: true,
    topRecommendation: null,
    lastActivityAt: NOW.toISOString(),
    now: NOW,
    ...overrides,
  };
}

test("prioriza entrevista em ate 3 dias sobre qualquer outro estado", () => {
  const input = baseInput({
    nearestInterview: {
      id: "app-1",
      jobTitle: "Analista de Dados",
      companyName: "Acme",
      nextActionAt: new Date("2026-08-29T12:00:00.000Z").toISOString(),
    },
    cvReadyUnsubmitted: { id: "app-2", jobTitle: "X", companyName: "Y" },
    hasAvailableCredits: false,
  });
  assert.equal(resolveHeroState(input).kind, "interview_soon");
});

test("nao dispara interview_soon para entrevista a mais de 3 dias", () => {
  const input = baseInput({
    nearestInterview: {
      id: "app-1",
      jobTitle: "Analista de Dados",
      companyName: "Acme",
      nextActionAt: new Date("2026-09-05T12:00:00.000Z").toISOString(),
    },
  });
  assert.notEqual(resolveHeroState(input).kind, "interview_soon");
});

test("cai para cv_ready_unsent quando nao ha entrevista proxima", () => {
  const input = baseInput({
    cvReadyUnsubmitted: { id: "app-2", jobTitle: "X", companyName: "Y" },
  });
  assert.equal(resolveHeroState(input).kind, "cv_ready_unsent");
});

test("cai para credits_empty quando os creditos zeraram", () => {
  const input = baseInput({ hasAvailableCredits: false });
  assert.equal(resolveHeroState(input).kind, "credits_empty");
});

test("nao dispara credits_empty com creditos ilimitados/disponiveis", () => {
  const input = baseInput({ hasAvailableCredits: true });
  assert.notEqual(resolveHeroState(input).kind, "credits_empty");
});

test("cai para high_match_recommendation com score >= 90", () => {
  const input = baseInput({
    topRecommendation: { jobTitle: "X", companyName: "Y", score: 94 },
  });
  assert.equal(resolveHeroState(input).kind, "high_match_recommendation");
});

test("ignora recomendacao com score abaixo do limiar", () => {
  const input = baseInput({
    topRecommendation: { jobTitle: "X", companyName: "Y", score: 70 },
  });
  assert.notEqual(resolveHeroState(input).kind, "high_match_recommendation");
});

test("cai para new_user quando nao ha nenhuma candidatura", () => {
  const input = baseInput({ hasAnyApplication: false, lastActivityAt: null });
  assert.equal(resolveHeroState(input).kind, "new_user");
});

test("cai para inactive apos 14+ dias sem atividade", () => {
  const input = baseInput({
    lastActivityAt: new Date("2026-08-01T12:00:00.000Z").toISOString(),
  });
  assert.equal(resolveHeroState(input).kind, "inactive");
});

test("cai para default quando nenhuma condicao se aplica", () => {
  const input = baseInput({
    lastActivityAt: new Date("2026-08-20T12:00:00.000Z").toISOString(),
  });
  assert.equal(resolveHeroState(input).kind, "default");
});
