import assert from "node:assert/strict";
import { test } from "node:test";

import {
  type CanonicalProfile,
  mapCertifications,
  mapCompetencies,
  mapEducation,
  mapExperiences,
  mapLanguages,
  mapProfileCache,
} from "./talent-canonical-mapper";

function baseProfile(
  overrides: Partial<CanonicalProfile> = {},
): CanonicalProfile {
  return {
    fullName: null,
    headline: null,
    email: null,
    phone: null,
    linkedinUrl: null,
    location: { city: null, state: null, country: null },
    professionalSummary: null,
    experiences: [],
    education: [],
    skills: [],
    languages: [],
    certifications: [],
    radarProfile: { areas: [], seniority: "UNKNOWN", careerFingerprint: [] },
    ...overrides,
  };
}

test("mapCompetencies normalizes and dedupes skills case-insensitively", () => {
  const result = mapCompetencies(
    baseProfile({ skills: ["Python", "python", "AWS", ""] }),
  );

  assert.equal(result.length, 2);
  assert.deepEqual(result.map((r) => r.valueNormalized).sort(), [
    "aws",
    "python",
  ]);
  assert.equal(result[0].category, "TECHNICAL_SKILL");
});

test("mapLanguages passes through language + level, skipping blanks", () => {
  const result = mapLanguages(
    baseProfile({
      languages: [
        { language: "Inglês", level: "Avançado" },
        { language: "  ", level: null },
      ],
    }),
  );

  assert.equal(result.length, 1);
  assert.equal(result[0].language, "Inglês");
  assert.equal(result[0].proficiencyLevel, "Avançado");
});

test("mapCertifications extracts a 4-digit year from free-form year text", () => {
  const result = mapCertifications(
    baseProfile({
      certifications: [
        {
          name: "AWS Solutions Architect",
          issuer: "AWS",
          year: "concluído em 2023",
        },
      ],
    }),
  );

  assert.equal(result[0].year, 2023);
  assert.equal(result[0].nameNormalized, "aws solutions architect");
});

test("mapExperiences drops entries missing company or role, parses dates and detects current role", () => {
  const result = mapExperiences(
    baseProfile({
      experiences: [
        {
          role: "Engenheiro de Dados",
          company: "Empresa X",
          location: "São Paulo",
          startDate: "2021-03",
          endDate: "presente",
          bullets: ["Liderou pipeline de dados"],
          technologies: ["Python", "Airflow"],
        },
        {
          role: null,
          company: "Empresa Sem Cargo",
          location: null,
          startDate: null,
          endDate: null,
          bullets: [],
          technologies: [],
        },
      ],
    }),
  );

  assert.equal(result.length, 1);
  assert.equal(result[0].companyNormalized, "empresa x");
  assert.equal(result[0].isCurrent, true);
  assert.deepEqual(result[0].startDate, new Date(2021, 2, 1));
});

test("mapEducation drops entries without an institution", () => {
  const result = mapEducation(
    baseProfile({
      education: [
        {
          institution: "USP",
          degree: "Bacharelado",
          fieldOfStudy: "Ciência da Computação",
          startDate: "2016",
          endDate: "2020",
        },
        {
          institution: null,
          degree: "Curso livre",
          fieldOfStudy: null,
          startDate: null,
          endDate: null,
        },
      ],
    }),
  );

  assert.equal(result.length, 1);
  assert.equal(result[0].institution, "USP");
});

test("mapProfileCache only includes fields the AI actually filled, and maps a known seniority/area", () => {
  const cache = mapProfileCache(
    baseProfile({
      fullName: "Fulano da Silva",
      email: "Fulano@Example.com",
      location: { city: "São Paulo", state: null, country: "Brasil" },
      radarProfile: {
        areas: ["DATA_AI", "NOT_A_REAL_AREA"],
        seniority: "SENIOR",
        careerFingerprint: [],
      },
    }),
  );

  assert.equal(cache.fullName, "Fulano da Silva");
  assert.equal(cache.primaryEmail, "fulano@example.com");
  assert.equal(cache.city, "São Paulo");
  assert.equal(cache.state, undefined);
  assert.equal(cache.seniority, "SENIOR");
  assert.deepEqual(cache.primaryAreas, ["DATA_AI"]);
});

test("mapProfileCache omits seniority when UNKNOWN and areas when empty", () => {
  const cache = mapProfileCache(baseProfile());

  assert.equal(cache.seniority, undefined);
  assert.equal(cache.primaryAreas, undefined);
});
