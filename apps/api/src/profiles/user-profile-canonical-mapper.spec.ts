import assert from "node:assert/strict";
import { test } from "node:test";

import type { UserProfile } from "@prisma/client";

import {
  flattenCanonicalCvProfileToText,
  isCanonicalCvProfileEffectivelyEmpty,
  mapUserProfileToCanonicalCvProfile,
  stableSerializeCanonicalCvProfile,
} from "./user-profile-canonical-mapper";

function buildProfile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    id: "profile-1",
    userId: "user-1",
    fullName: "Ana Souza",
    contactEmail: "ana@example.com",
    phone: "+55 11 90000-0000",
    linkedinUrl: "https://linkedin.com/in/anasouza",
    professionalSummary: "Gerente de produto com 8 anos de experiência.",
    headline: "Gerente de Produto",
    currentTitle: "Gerente de Produto Sênior",
    summary: null,
    yearsExperience: 8,
    city: "São Paulo",
    state: "SP",
    country: "Brasil",
    remotePreference: null,
    relocationPreference: null,
    targetSalaryMin: null,
    targetSalaryMax: null,
    preferredLanguage: null,
    experiencesJson: [
      {
        id: "exp-1",
        role: "Gerente de Produto",
        company: "Acme",
        startDate: "2020-01",
        endDate: null,
        isCurrent: true,
        description: "Lidera o time de produto.",
        achievements: ["Aumentou retenção em 20%"],
        relatedSkills: ["SQL", "Roadmapping"],
      },
    ],
    educationJson: [
      {
        id: "edu-1",
        institution: "USP",
        degree: "Bacharelado",
        fieldOfStudy: "Administração",
        startDate: "2012",
        endDate: "2016",
      },
    ],
    skillsJson: {
      technical: ["SQL"],
      business: ["Roadmapping"],
      soft: ["Comunicação"],
    },
    languagesJson: [{ language: "Inglês", level: "Fluente" }],
    certificationsJson: [
      { name: "PMP", issuer: "PMI", year: "2019" },
    ],
    profileFieldMetaJson: null,
    profileSuggestionsJson: null,
    profileReadinessStatus: "empty",
    radarAreas: [],
    radarSeniority: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as UserProfile;
}

test("mapUserProfileToCanonicalCvProfile maps every block into the canonical shape", () => {
  const profile = buildProfile();
  const canonical = mapUserProfileToCanonicalCvProfile(profile);

  assert.equal(canonical.fullName, "Ana Souza");
  assert.equal(canonical.email, "ana@example.com");
  assert.equal(canonical.phone, "+55 11 90000-0000");
  assert.equal(canonical.location.city, "São Paulo");
  assert.equal(canonical.professionalSummary, profile.professionalSummary);
  assert.equal(canonical.experiences.length, 1);
  assert.deepEqual(canonical.experiences[0].bullets, [
    "Lidera o time de produto.",
    "Aumentou retenção em 20%",
  ]);
  assert.deepEqual(canonical.experiences[0].technologies, [
    "SQL",
    "Roadmapping",
  ]);
  assert.equal(canonical.education.length, 1);
  assert.deepEqual(canonical.skills.sort(), [
    "Comunicação",
    "Roadmapping",
    "SQL",
  ]);
  assert.equal(canonical.languages.length, 1);
  assert.equal(canonical.certifications.length, 1);
});

test("mapUserProfileToCanonicalCvProfile falls back to summary when professionalSummary is empty", () => {
  const profile = buildProfile({
    professionalSummary: null,
    summary: "Resumo alternativo",
  });
  const canonical = mapUserProfileToCanonicalCvProfile(profile);
  assert.equal(canonical.professionalSummary, "Resumo alternativo");
});

test("isCanonicalCvProfileEffectivelyEmpty is true for a UserProfile with no real CV content", () => {
  const empty = buildProfile({
    fullName: null,
    professionalSummary: null,
    summary: null,
    experiencesJson: [],
    educationJson: [],
    skillsJson: { technical: [], business: [], soft: [] },
    languagesJson: [],
    certificationsJson: [],
  });
  const canonical = mapUserProfileToCanonicalCvProfile(empty);
  assert.equal(isCanonicalCvProfileEffectivelyEmpty(canonical), true);
});

test("isCanonicalCvProfileEffectivelyEmpty is false when only professionalSummary is set", () => {
  const profile = buildProfile({
    fullName: null,
    experiencesJson: [],
    educationJson: [],
    skillsJson: { technical: [], business: [], soft: [] },
    languagesJson: [],
    certificationsJson: [],
  });
  const canonical = mapUserProfileToCanonicalCvProfile(profile);
  assert.equal(isCanonicalCvProfileEffectivelyEmpty(canonical), false);
});

test("stableSerializeCanonicalCvProfile is order-independent and deterministic", () => {
  const profile = buildProfile();
  const canonical = mapUserProfileToCanonicalCvProfile(profile);
  const a = stableSerializeCanonicalCvProfile(canonical);
  const b = stableSerializeCanonicalCvProfile({ ...canonical });
  assert.equal(a, b);
});

test("stableSerializeCanonicalCvProfile changes when profile content changes", () => {
  const before = mapUserProfileToCanonicalCvProfile(buildProfile());
  const after = mapUserProfileToCanonicalCvProfile(
    buildProfile({ phone: "+55 11 98888-8888" }),
  );
  assert.notEqual(
    stableSerializeCanonicalCvProfile(before),
    stableSerializeCanonicalCvProfile(after),
  );
});

test("flattenCanonicalCvProfileToText produces non-empty readable text with key sections", () => {
  const canonical = mapUserProfileToCanonicalCvProfile(buildProfile());
  const text = flattenCanonicalCvProfileToText(canonical);
  assert.match(text, /Ana Souza/);
  assert.match(text, /Resumo profissional/);
  assert.match(text, /Experiência profissional/);
  assert.match(text, /Formação/);
});
