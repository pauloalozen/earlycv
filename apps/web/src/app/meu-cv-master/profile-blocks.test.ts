import { describe, expect, it } from "vitest";

import {
  buildClearAllPayload,
  buildProfileBlockStates,
  buildProfileBlockUpdatePayload,
  hasAnyProfileContent,
  profileBlockDefinitions,
} from "./profile-blocks";

const baseProfile = {
  certificationsJson: [],
  city: "São Paulo",
  contactEmail: "ana@trabalho.com",
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
});

describe("buildProfileBlockUpdatePayload", () => {
  it("serializes dados-pessoais fields", () => {
    const formData = new FormData();
    formData.set("fullName", "Ana Souza");
    formData.set("contactEmail", "ana@trabalho.com");
    formData.set("phone", "+55 11 99999-0000");
    formData.set("linkedinUrl", "https://linkedin.com/in/ana");
    formData.set("city", "São Paulo");
    formData.set("state", "SP");
    formData.set("country", "Brasil");

    expect(buildProfileBlockUpdatePayload("dados-pessoais", formData)).toEqual({
      fullName: "Ana Souza",
      contactEmail: "ana@trabalho.com",
      phone: "+55 11 99999-0000",
      linkedinUrl: "https://linkedin.com/in/ana",
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
      JSON.stringify({
        technical: ["SQL"],
        business: [],
        soft: ["Comunicação"],
      }),
    );

    expect(buildProfileBlockUpdatePayload("habilidades", formData)).toEqual({
      skillsJson: { technical: ["SQL"], business: [], soft: ["Comunicação"] },
    });
  });

  it("serializes links as empty (no backend field yet)", () => {
    const formData = new FormData();
    expect(buildProfileBlockUpdatePayload("links", formData)).toEqual({});
  });
});

describe("buildClearAllPayload", () => {
  it("clears headline along with the other identity fields", () => {
    // headline não é editável em nenhum bloco desta tela, mas é preenchido
    // pela extração de IA e entra no cálculo de profileReadinessStatus —
    // se "Limpar tudo" não zerar, o perfil fica preso em "partial"/"ready"
    // mesmo depois de limpo (bug: popup de confirmação de reupload continua
    // aparecendo com o perfil vazio).
    expect(buildClearAllPayload().headline).toBe("");
  });
});

describe("hasAnyProfileContent", () => {
  it("returns false for a null profile", () => {
    expect(hasAnyProfileContent(null)).toBe(false);
  });

  it("returns false when every visible block field is empty, even if headline (not shown on screen) has content", () => {
    const emptyProfile = {
      ...baseProfile,
      fullName: null,
      contactEmail: null,
      phone: null,
      linkedinUrl: null,
      city: null,
      state: null,
      country: null,
      professionalSummary: null,
      experiencesJson: [],
      educationJson: [],
      skillsJson: { technical: [], business: [], soft: [] },
      languagesJson: [],
      certificationsJson: [],
      // headline is intentionally left filled: it's not part of any block's
      // fields, so it must not make the popup think there's content on screen.
      headline: "Data Analyst",
    };

    expect(hasAnyProfileContent(emptyProfile)).toBe(false);
  });

  it("returns true when at least one visible field has content", () => {
    const partialProfile = {
      ...baseProfile,
      contactEmail: null,
      phone: null,
      linkedinUrl: null,
      city: null,
      state: null,
      country: null,
      professionalSummary: null,
      experiencesJson: [],
      educationJson: [],
      skillsJson: { technical: [], business: [], soft: [] },
      languagesJson: [],
      certificationsJson: [],
    };

    expect(hasAnyProfileContent(partialProfile)).toBe(true);
  });
});
