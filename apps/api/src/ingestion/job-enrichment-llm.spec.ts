import assert from "node:assert/strict";
import { test } from "node:test";

import {
  enrichJobWithLlm,
  JOB_ENRICHMENT_PROMPT_VERSION,
  SYSTEM_PROMPT,
} from "./job-enrichment-llm";

test("JOB_ENRICHMENT_PROMPT_VERSION está na v6", () => {
  assert.equal(JOB_ENRICHMENT_PROMPT_VERSION, "2026-08-18.v6");
});

test("SYSTEM_PROMPT inclui GROWTH_MARKETING com exemplos", () => {
  assert.match(SYSTEM_PROMPT, /GROWTH_MARKETING/);
  assert.match(SYSTEM_PROMPT, /growth hacker/);
  assert.match(SYSTEM_PROMPT, /SDR \(Sales Development Representative\)/);
});

test("SYSTEM_PROMPT inclui BUSINESS_ANALYTICS com exemplos", () => {
  assert.match(SYSTEM_PROMPT, /BUSINESS_ANALYTICS/);
  assert.match(SYSTEM_PROMPT, /business intelligence analyst/);
  assert.match(SYSTEM_PROMPT, /pricing analyst/);
});

test("SYSTEM_PROMPT inclui CX_DIGITAL com exemplos", () => {
  assert.match(SYSTEM_PROMPT, /CX_DIGITAL/);
  assert.match(SYSTEM_PROMPT, /conversational designer/);
  assert.match(SYSTEM_PROMPT, /UX researcher/);
});

test("SYSTEM_PROMPT inclui regra de SDR/BDR em empresa tradicional vs tech", () => {
  assert.match(
    SYSTEM_PROMPT,
    /Em empresa tradicional \(banco, indústria\), classifica como OTHER\./,
  );
});

test("SYSTEM_PROMPT inclui regra de Business Analyst por foco (dados/produto vs software vs processos)", () => {
  assert.match(SYSTEM_PROMPT, /focado em dados\/produto/);
  assert.match(SYSTEM_PROMPT, /focado em requisitos de software/);
});

test("SYSTEM_PROMPT inclui regra de Customer Success só CX_DIGITAL em produto digital", () => {
  assert.match(
    SYSTEM_PROMPT,
    /CS comercial\/vendas em empresa não-tech → OTHER\./,
  );
});

// Regressão: vagas claramente tech (Analista de Sistemas, Desenvolvedor)
// caindo em OTHER só por a empresa ser banco/varejo/jurídico, mesmo sem
// nenhuma regra pedindo isso — o modelo generalizava demais a heurística
// "empresa tradicional → OTHER" pensada pra SDR/CS/produto.
test("SYSTEM_PROMPT inclui regra deixando explícito que cargo de TI hands-on não vira OTHER só por a empresa não ser tech", () => {
  assert.match(SYSTEM_PROMPT, /sobre a empresa contratante/);
  assert.match(SYSTEM_PROMPT, /prospecção comercial ou expansão de negócio/);
});

test("SYSTEM_PROMPT inclui regra de desempate SAP developer (SOFTWARE_ENGINEERING/DATA_AI) vs consultor funcional (ERP_FUNCTIONAL)", () => {
  assert.match(SYSTEM_PROMPT, /SAP Data Developer/);
  assert.match(SYSTEM_PROMPT, /ERP_FUNCTIONAL\. Se o cargo é\n {2}developer\/engenheiro/);
});

function buildFakeClient(dominantArea: string) {
  return {
    chat: {
      completions: {
        create: async () => ({
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

test("enrichJobWithLlm classifica SDR em empresa tech como GROWTH_MARKETING (não OTHER)", async () => {
  const client = buildFakeClient("GROWTH_MARKETING");

  const result = await enrichJobWithLlm(client as never, "gpt-4o-mini", {
    title: "SDR - Sales Development Representative",
    department: "Growth",
    descriptionClean:
      "Vaga de SDR em fintech, responsável por prospecção outbound e qualificação de leads para o time de vendas.",
  });

  assert.equal(result.dominantArea, "GROWTH_MARKETING");
  assert.ok(result.areas.includes("GROWTH_MARKETING"));
  assert.notEqual(result.dominantArea, "OTHER");
});
