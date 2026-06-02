import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildProfileBlockStates,
  buildProfileBlockUpdatePayload,
  profileBlockDefinitions,
} from "./profile-blocks";

test("buildProfileBlockStates marks the first missing block as a gap", () => {
  const blocks = buildProfileBlockStates({
    certificationsJson: [],
    city: "São Paulo",
    country: "Brasil",
    currentTitle: "Analista de Dados",
    educationJson: [],
    experiencesJson: [],
    fullName: "Ana Souza",
    headline: "Data Analyst",
    id: "profile-1",
    languagesJson: [],
    linkedinUrl: "https://www.linkedin.com/in/ana",
    phone: "+55 11 99999-0000",
    preferredLanguage: "pt-BR",
    profileFieldMetaJson: {},
    profileReadinessStatus: "partial",
    profileSuggestionsJson: [],
    professionalSummary: "Resumo pronto",
    relocationPreference: null,
    remotePreference: "flexible",
    skillsJson: { business: [], soft: [], technical: [] },
    state: "SP",
    summary: "Resumo",
    targetSalaryMax: null,
    targetSalaryMin: null,
    userId: "user-1",
    yearsExperience: 5,
  });

  assert.equal(blocks[0].id, profileBlockDefinitions[0].id);
  assert.equal(blocks[0].hasGap, false);
  assert.equal(blocks[4].hasGap, true);
  assert.equal(blocks[4].missingCount, 1);
});

test("buildProfileBlockUpdatePayload serializes block values", () => {
  const formData = new FormData();
  formData.set("fullName", "Ana Souza");
  formData.set("headline", "Data Analyst");
  formData.set("professionalSummary", "Resumo atualizado");
  formData.set("yearsExperience", "6");
  formData.set("remotePreference", "remote");
  formData.set("relocationPreference", "on");
  formData.set(
    "skillsJson",
    JSON.stringify({ technical: ["SQL"], business: [], soft: ["Comunicação"] }),
  );

  assert.deepEqual(buildProfileBlockUpdatePayload("identity", formData), {
    fullName: "Ana Souza",
    headline: "Data Analyst",
    professionalSummary: "Resumo atualizado",
  });
  assert.deepEqual(buildProfileBlockUpdatePayload("goals", formData), {
    yearsExperience: 6,
    remotePreference: "remote",
    relocationPreference: true,
  });
  assert.deepEqual(buildProfileBlockUpdatePayload("skills", formData), {
    skillsJson: { technical: ["SQL"], business: [], soft: ["Comunicação"] },
  });
});
