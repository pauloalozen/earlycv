import { describe, expect, it } from "vitest";

import {
  buildProfileBlockStates,
  buildProfileBlockUpdatePayload,
  profileBlockDefinitions,
} from "./profile-blocks";

const baseProfile = {
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
  profileReadinessStatus: "partial" as const,
  profileSuggestionsJson: [],
  professionalSummary: "Resumo pronto",
  relocationPreference: null,
  remotePreference: "flexible" as const,
  skillsJson: { business: [], soft: [], technical: [] },
  state: "SP",
  summary: "Resumo",
  targetSalaryMax: null,
  targetSalaryMin: null,
  userId: "user-1",
  yearsExperience: 5,
};

describe("profileBlockDefinitions", () => {
  it("has 8 blocks in design order", () => {
    const ids = profileBlockDefinitions.map((b) => b.id);
    expect(ids).toEqual([
      "dados-pessoais",
      "resumo",
      "experiencias",
      "formacao",
      "habilidades",
      "idiomas",
      "certificacoes",
      "links",
    ]);
  });
});

describe("buildProfileBlockStates", () => {
  it("marks dados-pessoais as completo when all fields present", () => {
    const blocks = buildProfileBlockStates(baseProfile);
    expect(blocks[0].id).toBe("dados-pessoais");
    expect(blocks[0].hasGap).toBe(false);
  });

  it("marks experiencias as lacuna when empty", () => {
    const blocks = buildProfileBlockStates(baseProfile);
    expect(blocks[2].id).toBe("experiencias");
    expect(blocks[2].hasGap).toBe(true);
    expect(blocks[2].missingCount).toBe(1);
  });

  it("marks links as completo when linkedinUrl present", () => {
    const blocks = buildProfileBlockStates(baseProfile);
    expect(blocks[7].id).toBe("links");
    expect(blocks[7].hasGap).toBe(false);
  });

  it("marks dados-pessoais as lacuna when fullName missing", () => {
    const blocks = buildProfileBlockStates({ ...baseProfile, fullName: null });
    expect(blocks[0].id).toBe("dados-pessoais");
    expect(blocks[0].hasGap).toBe(true);
  });

  it("sets hasSugestao to false (no backend signal yet)", () => {
    const blocks = buildProfileBlockStates(baseProfile);
    expect(blocks.every((b) => b.hasSugestao === false)).toBe(true);
  });
});

describe("buildProfileBlockUpdatePayload", () => {
  it("serializes dados-pessoais fields", () => {
    const formData = new FormData();
    formData.set("fullName", "Ana Souza");
    formData.set("phone", "+55 11 99999-0000");
    formData.set("city", "São Paulo");
    formData.set("state", "SP");
    formData.set("country", "Brasil");

    expect(buildProfileBlockUpdatePayload("dados-pessoais", formData)).toEqual({
      fullName: "Ana Souza",
      phone: "+55 11 99999-0000",
      city: "São Paulo",
      state: "SP",
      country: "Brasil",
    });
  });

  it("serializes resumo field", () => {
    const formData = new FormData();
    formData.set("professionalSummary", "Resumo atualizado");

    expect(buildProfileBlockUpdatePayload("resumo", formData)).toEqual({
      professionalSummary: "Resumo atualizado",
    });
  });

  it("serializes habilidades as JSON", () => {
    const formData = new FormData();
    formData.set(
      "skillsJson",
      JSON.stringify({ technical: ["SQL"], business: [], soft: ["Comunicação"] }),
    );

    expect(buildProfileBlockUpdatePayload("habilidades", formData)).toEqual({
      skillsJson: { technical: ["SQL"], business: [], soft: ["Comunicação"] },
    });
  });

  it("serializes links field", () => {
    const formData = new FormData();
    formData.set("linkedinUrl", "https://linkedin.com/in/ana");

    expect(buildProfileBlockUpdatePayload("links", formData)).toEqual({
      linkedinUrl: "https://linkedin.com/in/ana",
    });
  });
});
