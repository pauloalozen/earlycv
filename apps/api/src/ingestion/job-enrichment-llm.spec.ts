import { describe, expect, it, vi } from "vitest";

import {
  enrichJobWithLlm,
  JOB_ENRICHMENT_PROMPT_VERSION,
  SYSTEM_PROMPT,
} from "./job-enrichment-llm";

describe("JOB_ENRICHMENT_PROMPT_VERSION", () => {
  it("está na v6", () => {
    expect(JOB_ENRICHMENT_PROMPT_VERSION).toBe("2026-08-18.v6");
  });
});

describe("SYSTEM_PROMPT — taxonomia de áreas Sprint 7", () => {
  it("inclui GROWTH_MARKETING com exemplos", () => {
    expect(SYSTEM_PROMPT).toContain("GROWTH_MARKETING");
    expect(SYSTEM_PROMPT).toContain("growth hacker");
    expect(SYSTEM_PROMPT).toContain("SDR (Sales Development Representative)");
  });

  it("inclui BUSINESS_ANALYTICS com exemplos", () => {
    expect(SYSTEM_PROMPT).toContain("BUSINESS_ANALYTICS");
    expect(SYSTEM_PROMPT).toContain("business intelligence analyst");
    expect(SYSTEM_PROMPT).toContain("pricing analyst");
  });

  it("inclui CX_DIGITAL com exemplos", () => {
    expect(SYSTEM_PROMPT).toContain("CX_DIGITAL");
    expect(SYSTEM_PROMPT).toContain("conversational designer");
    expect(SYSTEM_PROMPT).toContain("UX researcher");
  });

  it("inclui regra de SDR/BDR em empresa tradicional vs tech", () => {
    expect(SYSTEM_PROMPT).toContain(
      "Em empresa tradicional (banco, indústria), classifica como OTHER.",
    );
  });

  it("inclui regra de Business Analyst por foco (dados/produto vs software vs processos)", () => {
    expect(SYSTEM_PROMPT).toContain("focado em dados/produto");
    expect(SYSTEM_PROMPT).toContain("focado em requisitos de software");
  });

  it("inclui regra de Customer Success só CX_DIGITAL em produto digital", () => {
    expect(SYSTEM_PROMPT).toContain(
      "CS comercial/vendas em empresa não-tech → OTHER.",
    );
  });

  // Regressão: vagas claramente tech (Analista de Sistemas, Desenvolvedor)
  // caindo em OTHER só por a empresa ser banco/varejo/jurídico, mesmo sem
  // nenhuma regra pedindo isso — o modelo generalizava demais a heurística
  // "empresa tradicional → OTHER" pensada pra SDR/CS/produto.
  it("inclui regra deixando explícito que cargo de TI hands-on não vira OTHER só por a empresa não ser tech", () => {
    expect(SYSTEM_PROMPT).toContain("sobre a empresa contratante");
    expect(SYSTEM_PROMPT).toContain(
      "prospecção comercial ou expansão de negócio",
    );
  });

  it("inclui regra de desempate SAP developer (SOFTWARE_ENGINEERING/DATA_AI) vs consultor funcional (ERP_FUNCTIONAL)", () => {
    expect(SYSTEM_PROMPT).toContain("SAP Data Developer");
    expect(SYSTEM_PROMPT).toContain(
      "ERP_FUNCTIONAL. Se o cargo é\n  developer/engenheiro",
    );
  });
});

describe("enrichJobWithLlm — classificação das novas áreas", () => {
  function buildFakeClient(dominantArea: string) {
    return {
      chat: {
        completions: {
          create: vi.fn().mockResolvedValue({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    dominantArea,
                    areas: [dominantArea],
                    specialties: [],
                    seniority: "MID",
                    requiredSkills: [],
                    optionalSkills: [],
                    technologies: [],
                    contractType: "CLT",
                    languageRequirements: [],
                    certifications: [],
                    experienceYearsMin: null,
                    managementRequired: false,
                    travelRequired: false,
                    careerFingerprint: ["SDR"],
                  }),
                },
              },
            ],
          }),
        },
        // biome-ignore lint/suspicious/noExplicitAny: shape mínimo pra satisfazer o client OpenAI no teste
      } as any,
    };
  }

  it("classifica SDR em empresa tech como GROWTH_MARKETING (não OTHER)", async () => {
    const client = buildFakeClient("GROWTH_MARKETING");

    const result = await enrichJobWithLlm(client as never, "gpt-4o-mini", {
      title: "SDR - Sales Development Representative",
      department: "Growth",
      descriptionClean:
        "Vaga de SDR em fintech, responsável por prospecção outbound e qualificação de leads para o time de vendas.",
    });

    expect(result.dominantArea).toBe("GROWTH_MARKETING");
    expect(result.areas).toContain("GROWTH_MARKETING");
    expect(result.dominantArea).not.toBe("OTHER");
  });
});
