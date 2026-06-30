import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";
import type OpenAI from "openai";
import type {
  CvAdaptationInput,
  CvAdaptationOutput,
  JobRequirementCoverage,
  StructuredJobRequirement,
} from "./cv-adaptation.js";
import { adaptCv, analyzeAndAdaptCv } from "./cv-adaptation.js";

describe("adaptCv", () => {
  it("returns a valid CvAdaptationOutput shape when AI responds correctly", async () => {
    const mockOutput: CvAdaptationOutput = {
      summary: "Experienced engineer with strong background in systems design.",
      sections: [
        {
          sectionType: "experience",
          title: "Professional Experience",
          items: [
            {
              heading: "Senior Engineer",
              subheading: "Tech Corp",
              dateRange: "2022-2024",
              bullets: ["Led team of 5 engineers", "Shipped to 10M+ users"],
            },
          ],
        },
      ],
      highlightedSkills: ["TypeScript", "System Design"],
      removedSections: ["Languages"],
      adaptationNotes: "Reordered to emphasize leadership and scale.",
    };

    const mockClient = {
      chat: {
        completions: {
          create: mock.fn(async () => ({
            choices: [
              {
                message: {
                  content: JSON.stringify(mockOutput),
                },
              },
            ],
            usage: {
              prompt_tokens: 100,
              completion_tokens: 200,
              total_tokens: 300,
            },
          })),
        },
      },
    } as unknown as OpenAI;

    const input: CvAdaptationInput = {
      masterCvText: "Engineer with 5 years experience...",
      jobDescriptionText: "We seek a senior engineer...",
      jobTitle: "Senior Engineer",
      companyName: "Tech Corp",
    };

    const { output, audit } = await adaptCv(mockClient, "gpt-4-mini", input);

    assert.ok(output.summary);
    assert.ok(Array.isArray(output.sections));
    assert.ok(output.sections.length > 0);
    assert.ok(Array.isArray(output.highlightedSkills));
    assert.ok(output.adaptationNotes);
    assert.ok(audit.traceId);
    assert.equal(audit.provider, "openai");
    assert.ok(audit.usage);
    assert.equal(audit.usage.promptTokens, 100);
  });

  it("throws when AI returns malformed JSON", async () => {
    const mockClient = {
      chat: {
        completions: {
          create: mock.fn(async () => ({
            choices: [
              {
                message: {
                  content: "not valid json at all",
                },
              },
            ],
          })),
        },
      },
    } as unknown as OpenAI;

    const input: CvAdaptationInput = {
      masterCvText: "Engineer...",
      jobDescriptionText: "Job...",
    };

    await assert.rejects(
      () => adaptCv(mockClient, "gpt-4-mini", input),
      /JSON|parse/i,
    );
  });

  it("throws when output is missing required fields", async () => {
    const mockClient = {
      chat: {
        completions: {
          create: mock.fn(async () => ({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    summary: "test",
                    // missing sections
                  }),
                },
              },
            ],
          })),
        },
      },
    } as unknown as OpenAI;

    const input: CvAdaptationInput = {
      masterCvText: "Engineer...",
      jobDescriptionText: "Job...",
    };

    await assert.rejects(
      () => adaptCv(mockClient, "gpt-4-mini", input),
      /required|missing|sections/i,
    );
  });
});

describe("analyzeAndAdaptCv", () => {
  it("creates structured requirements on first analysis", async () => {
    const mockClient = {
      chat: {
        completions: {
          create: mock.fn(async () => ({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    vaga: {
                      cargo: "Analista de Dados",
                      empresa: "Acme",
                    },
                    requirements: [
                      {
                        requirementText:
                          "Experiencia com SQL para analise de dados",
                        importance: "high",
                        coverageStatus: "partial",
                        evidence: ["Uso de SQL em BI"],
                        gapExplanation:
                          "SQL aparece, mas com pouca profundidade",
                        recommendation:
                          "Detalhar consultas, modelagem e volume de dados se isso for verdadeiro",
                        impactScore: 18,
                      },
                    ],
                    fit: {
                      score: 72,
                      score_pos_ajustes: 84,
                      categoria: "medio",
                      headline: "Falta profundidade em SQL",
                      subheadline:
                        "A aderencia melhora ao evidenciar mais contexto tecnico",
                    },
                    secoes: {
                      experiencia: { score: 30, max: 40 },
                      competencias: { score: 28, max: 40 },
                      formatacao: { score: 14, max: 20 },
                    },
                    positivos: [],
                    ajustes_conteudo: [],
                    keywords: { presentes: [], ausentes: [] },
                    formato_cv: {
                      ats_score: 80,
                      resumo: "ok",
                      problemas: [],
                      campos: [],
                    },
                    comparacao: { antes: "antes", depois: "depois" },
                    preview: { antes: "antes", depois: "depois" },
                    pontos_fortes: [],
                    lacunas: ["placeholder"],
                    melhorias_aplicadas: [],
                    ats_keywords: { presentes: [], ausentes: [] },
                    projecao_melhoria: {
                      score_atual: 72,
                      score_pos_otimizacao: 84,
                      explicacao_curta: "ok",
                    },
                    mensagem_venda: { titulo: "ok", subtexto: "ok" },
                  }),
                },
              },
            ],
          })),
        },
      },
    } as unknown as OpenAI;

    const output = await analyzeAndAdaptCv(mockClient, "gpt-4-mini", {
      masterCvText: "Experiencia com BI e SQL.",
      jobDescriptionText: "Vaga com SQL, dashboards e stakeholders.",
      canonicalJobJson: { title: "Analista de Dados" },
    });

    assert.equal(output.analysisVersion, "requirements_v2");
    assert.equal(output.fit.score, 10);
    assert.equal(output.fit.score_pos_ajustes, 23);
    assert.equal(output.scoreBefore, 10);
    assert.equal(output.scoreAfter, 23);
    assert.equal(output.requirements.length, 1);
    assert.match(output.requirements[0]?.requirementKey ?? "", /sql/i);
    assert.equal(output.requirements[0]?.coveragePercent, 50);
    assert.deepEqual(output.lacunas, [
      "SQL aparece, mas com pouca profundidade",
    ]);
  });

  it("covered requirements are excluded from lacunas", async () => {
    const mockClient = {
      chat: {
        completions: {
          create: mock.fn(async () => ({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    vaga: { cargo: "Analista", empresa: "Acme" },
                    requirements: [
                      {
                        requirementText: "SQL para análise de dados",
                        importance: "high",
                        coverageStatus: "covered",
                        evidence: ["Projeto com SQL e BI"],
                        gapExplanation: "",
                        recommendation: "",
                        impactScore: 20,
                      },
                      {
                        requirementText: "Python para automação",
                        importance: "medium",
                        coverageStatus: "missing",
                        evidence: [],
                        gapExplanation: "Python não aparece no currículo",
                        recommendation: "Adicionar se for verdade",
                        impactScore: 10,
                      },
                    ],
                    fit: {
                      score: 60,
                      score_pos_ajustes: 75,
                      categoria: "medio",
                      headline: "ok",
                      subheadline: "ok",
                    },
                    secoes: {
                      experiencia: { score: 24, max: 40 },
                      competencias: { score: 22, max: 40 },
                      formatacao: { score: 14, max: 20 },
                    },
                    positivos: [],
                    ajustes_conteudo: [],
                    keywords: { presentes: [], ausentes: [] },
                    formato_cv: {
                      ats_score: 70,
                      resumo: "ok",
                      problemas: [],
                      campos: [],
                    },
                    comparacao: { antes: "antes", depois: "depois" },
                    preview: { antes: "antes", depois: "depois" },
                    pontos_fortes: [],
                    lacunas: ["placeholder — deve ser substituído"],
                    melhorias_aplicadas: [],
                    ats_keywords: { presentes: [], ausentes: [] },
                    projecao_melhoria: {
                      score_atual: 60,
                      score_pos_otimizacao: 75,
                      explicacao_curta: "ok",
                    },
                    mensagem_venda: { titulo: "ok", subtexto: "ok" },
                  }),
                },
              },
            ],
          })),
        },
      },
    } as unknown as OpenAI;

    const output = await analyzeAndAdaptCv(mockClient, "gpt-4-mini", {
      masterCvText: "Experiência com SQL e BI.",
      jobDescriptionText: "Vaga com SQL e Python.",
      canonicalJobJson: { title: "Analista" },
    });

    assert.equal(output.lacunas.length, 1);
    assert.match(output.lacunas[0] ?? "", /Python não aparece/i);
    const coverageKeys = output.requirements.map((r) => r.coverageStatus);
    assert.ok(coverageKeys.includes("covered"));
    assert.ok(coverageKeys.includes("missing"));
  });

  it("preserves explicit keyword labels instead of replacing them with requirement phrases", async () => {
    const mockClient = {
      chat: {
        completions: {
          create: mock.fn(async () => ({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    vaga: { cargo: "Analista", empresa: "Acme" },
                    requirements: [
                      {
                        requirementText: "Experiencia com SQL e BI",
                        importance: "high",
                        coverageStatus: "covered",
                        evidence: ["Projeto com SQL"],
                        gapExplanation: "",
                        recommendation: "",
                        impactScore: 12,
                      },
                      {
                        requirementText: "Automacao com Python para dados",
                        importance: "medium",
                        coverageStatus: "partial",
                        evidence: ["Scripts internos"],
                        gapExplanation: "",
                        recommendation: "",
                        impactScore: 10,
                      },
                    ],
                    fit: {
                      score: 70,
                      score_pos_ajustes: 82,
                      categoria: "medio",
                      headline: "ok",
                      subheadline: "ok",
                    },
                    secoes: {
                      experiencia: { score: 28, max: 40 },
                      competencias: { score: 24, max: 40 },
                      formatacao: { score: 16, max: 20 },
                    },
                    positivos: [],
                    ajustes_conteudo: [],
                    keywords: {
                      presentes: [{ kw: "SQL", pontos: 2 }],
                      ausentes: [{ kw: "Python", pontos: 1 }],
                    },
                    formato_cv: {
                      ats_score: 80,
                      resumo: "ok",
                      problemas: [],
                      campos: [],
                    },
                    comparacao: { antes: "antes", depois: "depois" },
                    preview: { antes: "antes", depois: "depois" },
                    pontos_fortes: [],
                    lacunas: [],
                    melhorias_aplicadas: [],
                    ats_keywords: { presentes: [], ausentes: [] },
                    projecao_melhoria: {
                      score_atual: 70,
                      score_pos_otimizacao: 82,
                      explicacao_curta: "ok",
                    },
                    mensagem_venda: { titulo: "ok", subtexto: "ok" },
                  }),
                },
              },
            ],
          })),
        },
      },
    } as unknown as OpenAI;

    const output = await analyzeAndAdaptCv(mockClient, "gpt-4-mini", {
      masterCvText: "Experiencia com BI e SQL.",
      jobDescriptionText: "Vaga com SQL, Python e dashboards.",
      canonicalJobJson: { title: "Analista de Dados" },
    });

    assert.deepEqual(
      output.keywords.presentes.map((item) => item.kw),
      ["SQL"],
    );
    assert.deepEqual(
      output.keywords.ausentes.map((item) => item.kw),
      ["Python"],
    );
  });

  it("reuses a fixed keyword ruler on reanalysis when existingKeywordRule is provided", async () => {
    const mockClient = {
      chat: {
        completions: {
          create: mock.fn(async () => ({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    vaga: { cargo: "Analista", empresa: "Acme" },
                    requirements: [
                      {
                        requirementKey: "quality-practices",
                        requirementText:
                          "Vivência com práticas de qualidade de engenharia como code review, testes, observabilidade e dívida técnica.",
                        importance: "high",
                        gateLevel: "hard",
                        coverageStatus: "partial",
                        evidence: [
                          "Code review, testes e observabilidade aplicados",
                        ],
                        gapExplanation:
                          "Code review, testes e observabilidade aparecem, mas dívida técnica não fica comprovada.",
                        recommendation: "",
                        impactScore: 9,
                      },
                    ],
                    fit: {
                      score: 70,
                      score_pos_ajustes: 82,
                      categoria: "medio",
                      headline: "ok",
                      subheadline: "ok",
                    },
                    secoes: {
                      experiencia: { score: 28, max: 40 },
                      competencias: { score: 24, max: 40 },
                      formatacao: { score: 16, max: 20 },
                    },
                    positivos: [],
                    ajustes_conteudo: [],
                    keywords: {
                      presentes: [
                        { kw: "code review", pontos: 2 },
                        { kw: "testes", pontos: 2 },
                        { kw: "observabilidade", pontos: 2 },
                      ],
                      ausentes: [
                        { kw: "dívida técnica", pontos: 1 },
                        { kw: "confiabilidade", pontos: 1 },
                      ],
                    },
                    formato_cv: {
                      ats_score: 80,
                      resumo: "ok",
                      problemas: [],
                      campos: [],
                    },
                    comparacao: { antes: "antes", depois: "depois" },
                    preview: { antes: "antes", depois: "depois" },
                    pontos_fortes: [],
                    lacunas: [],
                    melhorias_aplicadas: [],
                    ats_keywords: { presentes: [], ausentes: [] },
                    projecao_melhoria: {
                      score_atual: 70,
                      score_pos_otimizacao: 82,
                      explicacao_curta: "ok",
                    },
                    mensagem_venda: { titulo: "ok", subtexto: "ok" },
                  }),
                },
              },
            ],
          })),
        },
      },
    } as unknown as OpenAI;

    const output = await analyzeAndAdaptCv(mockClient, "gpt-4-mini", {
      masterCvText: "Experiencia com BI e SQL.",
      jobDescriptionText: "Vaga com qualidade de engenharia.",
      canonicalJobJson: { title: "Analista de Dados" },
      existingRequirements: [
        {
          requirementKey: "quality-practices",
          requirementText:
            "Vivência com práticas de qualidade de engenharia como code review, testes, observabilidade e dívida técnica.",
          importance: "high",
          gateLevel: "hard",
        },
      ],
      existingKeywordRule: {
        presentes: [{ kw: "arquitetura de sistemas", pontos: 6 }],
        ausentes: [
          { kw: "code review", pontos: 4 },
          { kw: "testes", pontos: 4 },
          { kw: "observabilidade", pontos: 4 },
          { kw: "dívida técnica", pontos: 3 },
        ],
      },
    });

    assert.deepEqual(
      output.keywords.presentes.map((item) => item.kw),
      ["arquitetura de sistemas", "code review", "testes", "observabilidade"],
    );
    assert.deepEqual(
      output.keywords.ausentes.map((item) => item.kw),
      ["dívida técnica"],
    );
  });

  it("lacunas fall back to recommendation when gapExplanation is empty", async () => {
    const mockClient = {
      chat: {
        completions: {
          create: mock.fn(async () => ({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    vaga: { cargo: "Analista", empresa: "Acme" },
                    requirements: [
                      {
                        requirementText: "Experiência em gestão de projetos",
                        importance: "high",
                        coverageStatus: "partial",
                        evidence: ["Menção pontual a projetos"],
                        gapExplanation: "",
                        recommendation:
                          "Detalhar escopo e resultado dos projetos",
                        impactScore: 12,
                      },
                    ],
                    fit: {
                      score: 55,
                      score_pos_ajustes: 70,
                      categoria: "medio",
                      headline: "ok",
                      subheadline: "ok",
                    },
                    secoes: {
                      experiencia: { score: 22, max: 40 },
                      competencias: { score: 20, max: 40 },
                      formatacao: { score: 13, max: 20 },
                    },
                    positivos: [],
                    ajustes_conteudo: [],
                    keywords: { presentes: [], ausentes: [] },
                    formato_cv: {
                      ats_score: 65,
                      resumo: "ok",
                      problemas: [],
                      campos: [],
                    },
                    comparacao: { antes: "antes", depois: "depois" },
                    preview: { antes: "antes", depois: "depois" },
                    pontos_fortes: [],
                    lacunas: [],
                    melhorias_aplicadas: [],
                    ats_keywords: { presentes: [], ausentes: [] },
                    projecao_melhoria: {
                      score_atual: 55,
                      score_pos_otimizacao: 70,
                      explicacao_curta: "ok",
                    },
                    mensagem_venda: { titulo: "ok", subtexto: "ok" },
                  }),
                },
              },
            ],
          })),
        },
      },
    } as unknown as OpenAI;

    const output = await analyzeAndAdaptCv(mockClient, "gpt-4-mini", {
      masterCvText: "Profissional com envolvimento em projetos.",
      jobDescriptionText: "Vaga com foco em gestão de projetos.",
      canonicalJobJson: { title: "Analista" },
    });

    assert.equal(output.lacunas.length, 1);
    assert.equal(output.lacunas[0], "Detalhar escopo e resultado dos projetos");
  });

  it("lacunas fall back to requirementText when both gapExplanation and recommendation are empty", async () => {
    const mockClient = {
      chat: {
        completions: {
          create: mock.fn(async () => ({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    vaga: { cargo: "Analista", empresa: "Acme" },
                    requirements: [
                      {
                        requirementText: "Certificação PMP",
                        importance: "low",
                        coverageStatus: "missing",
                        evidence: [],
                        gapExplanation: "",
                        recommendation: "",
                        impactScore: 5,
                      },
                    ],
                    fit: {
                      score: 50,
                      score_pos_ajustes: 55,
                      categoria: "medio",
                      headline: "ok",
                      subheadline: "ok",
                    },
                    secoes: {
                      experiencia: { score: 20, max: 40 },
                      competencias: { score: 20, max: 40 },
                      formatacao: { score: 10, max: 20 },
                    },
                    positivos: [],
                    ajustes_conteudo: [],
                    keywords: { presentes: [], ausentes: [] },
                    formato_cv: {
                      ats_score: 60,
                      resumo: "ok",
                      problemas: [],
                      campos: [],
                    },
                    comparacao: { antes: "antes", depois: "depois" },
                    preview: { antes: "antes", depois: "depois" },
                    pontos_fortes: [],
                    lacunas: [],
                    melhorias_aplicadas: [],
                    ats_keywords: { presentes: [], ausentes: [] },
                    projecao_melhoria: {
                      score_atual: 50,
                      score_pos_otimizacao: 55,
                      explicacao_curta: "ok",
                    },
                    mensagem_venda: { titulo: "ok", subtexto: "ok" },
                  }),
                },
              },
            ],
          })),
        },
      },
    } as unknown as OpenAI;

    const output = await analyzeAndAdaptCv(mockClient, "gpt-4-mini", {
      masterCvText: "Profissional sem certificação PMP.",
      jobDescriptionText: "Vaga com PMP desejável.",
      canonicalJobJson: { title: "Analista" },
    });

    assert.equal(output.lacunas.length, 1);
    assert.equal(output.lacunas[0], "Certificação PMP");
  });

  it("preserves the existing requirement rule during reanalysis", async () => {
    const existingRequirements: StructuredJobRequirement[] = [
      {
        requirementKey: "sql-analytics",
        requirementText: "Experiencia com SQL para analise de dados",
        importance: "high",
      },
    ];

    const mockClient = {
      chat: {
        completions: {
          create: mock.fn(async () => ({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    vaga: {
                      cargo: "Analista de Dados",
                      empresa: "Acme",
                    },
                    requirements: [
                      {
                        requirementKey: "changed-key",
                        requirementText:
                          "Experiencia com SQL para analise de dados",
                        importance: "high",
                        coverageStatus: "covered",
                        evidence: ["Projeto com SQL e dashboards"],
                        gapExplanation: "",
                        recommendation: "Manter destaque para SQL e dashboards",
                        impactScore: 20,
                      },
                    ],
                    fit: {
                      score: 88,
                      score_pos_ajustes: 91,
                      categoria: "alto",
                      headline: "Boa aderencia tecnica",
                      subheadline: "SQL aparece com evidencia suficiente",
                    },
                    secoes: {
                      experiencia: { score: 36, max: 40 },
                      competencias: { score: 34, max: 40 },
                      formatacao: { score: 18, max: 20 },
                    },
                    positivos: [],
                    ajustes_conteudo: [],
                    keywords: { presentes: [], ausentes: [] },
                    formato_cv: {
                      ats_score: 90,
                      resumo: "ok",
                      problemas: [],
                      campos: [],
                    },
                    comparacao: { antes: "antes", depois: "depois" },
                    preview: { antes: "antes", depois: "depois" },
                    pontos_fortes: [],
                    lacunas: [],
                    melhorias_aplicadas: [],
                    ats_keywords: { presentes: [], ausentes: [] },
                    projecao_melhoria: {
                      score_atual: 88,
                      score_pos_otimizacao: 91,
                      explicacao_curta: "ok",
                    },
                    mensagem_venda: { titulo: "ok", subtexto: "ok" },
                  }),
                },
              },
            ],
          })),
        },
      },
    } as unknown as OpenAI;

    const output = await analyzeAndAdaptCv(mockClient, "gpt-4-mini", {
      masterCvText: "Experiencia com BI e SQL.",
      jobDescriptionText: "Vaga com SQL, dashboards e stakeholders.",
      canonicalJobJson: { title: "Analista de Dados" },
      existingRequirements,
    });

    assert.equal(output.requirements[0]?.requirementKey, "sql-analytics");
    assert.deepEqual(output.lacunas, []);
  });
});

// ---------------------------------------------------------------------------
// adaptCv — requirement-guided generation
// ---------------------------------------------------------------------------

const stubSection = {
  sectionType: "other" as const,
  title: "Experiência",
  items: [{ heading: "Empresa X", bullets: ["Analista de dados"] }],
};

function makeAdaptMockClient(output: CvAdaptationOutput) {
  const withSection: CvAdaptationOutput = {
    adaptationNotes: "Notas de adaptacao stub.",
    ...output,
    sections: output.sections.length ? output.sections : [stubSection],
  };
  return {
    chat: {
      completions: {
        create: mock.fn(async () => ({
          choices: [{ message: { content: JSON.stringify(withSection) } }],
        })),
      },
    },
  } as unknown as OpenAI;
}

const sampleCoverage: JobRequirementCoverage[] = [
  {
    requirementKey: "sql-analytics",
    requirementText: "Experiencia com SQL para analise de dados",
    importance: "high",
    coverageStatus: "partial",
    evidence: ["Mencionado no sumario"],
    gapExplanation: "Sem entregas concretas com SQL",
    recommendation: "Destacar projetos com SQL e metricas reais",
    impactScore: 18,
  },
  {
    requirementKey: "stakeholder-communication",
    requirementText: "Comunicacao com stakeholders executivos",
    importance: "medium",
    coverageStatus: "missing",
    evidence: [],
    gapExplanation: "Sem evidencia de comunicacao executiva",
    recommendation: "Incluir exemplos de apresentacoes ou reports",
    impactScore: 10,
  },
];

describe("adaptCv — requirement-guided generation", () => {
  it("inclui requirementAdaptationActions no output quando coverage e fornecida", async () => {
    const mockOutput: CvAdaptationOutput = {
      summary: "Analista com experiencia em SQL e comunicacao.",
      sections: [],
      highlightedSkills: [],
      removedSections: [],
      requirementAdaptationActions: [
        {
          requirementKey: "sql-analytics",
          action: "strengthened",
          whereChanged: ["Experiência Profissional"],
          reason: "Adicionado projeto com SQL e dashboard de vendas",
          truthfulnessRisk: "low",
        },
        {
          requirementKey: "stakeholder-communication",
          action: "not_addressed",
          whereChanged: [],
          reason: "Sem base factual no CV original",
          truthfulnessRisk: "low",
        },
      ],
    };

    const client = makeAdaptMockClient(mockOutput);
    const { output } = await adaptCv(client, "gpt-4o-mini", {
      masterCvText: "SQL basico. Analista.",
      jobDescriptionText: "Vaga com SQL e stakeholders executivos.",
      requirementCoverage: sampleCoverage,
    });

    assert.ok(
      Array.isArray(output.requirementAdaptationActions),
      "requirementAdaptationActions deve ser array",
    );
    assert.equal(output.requirementAdaptationActions?.length, 2);
    assert.equal(
      output.requirementAdaptationActions?.[0]?.requirementKey,
      "sql-analytics",
    );
    assert.equal(
      output.requirementAdaptationActions?.[0]?.action,
      "strengthened",
    );
  });

  it("normalizer preenche not_addressed para chaves que o modelo omitiu", async () => {
    const mockOutput: CvAdaptationOutput = {
      summary: "CV parcial.",
      sections: [],
      highlightedSkills: [],
      removedSections: [],
      requirementAdaptationActions: [
        // modelo retornou apenas uma das duas chaves esperadas
        {
          requirementKey: "sql-analytics",
          action: "preserved",
          whereChanged: [],
          reason: "Mantido como esta",
          truthfulnessRisk: "low",
        },
      ],
    };

    const client = makeAdaptMockClient(mockOutput);
    const { output } = await adaptCv(client, "gpt-4o-mini", {
      masterCvText: "SQL intermediario.",
      jobDescriptionText: "Vaga com SQL e stakeholders.",
      requirementCoverage: sampleCoverage,
    });

    const actions = output.requirementAdaptationActions ?? [];
    assert.equal(actions.length, 2, "deve ter uma entrada por requirementKey");

    const missing = actions.find(
      (a) => a.requirementKey === "stakeholder-communication",
    );
    assert.ok(missing, "chave omitida pelo modelo deve aparecer no output");
    assert.equal(
      missing?.action,
      "not_addressed",
      "chave omitida recebe not_addressed",
    );
  });

  it("normalizer descarta chaves inventadas pelo modelo que nao estao na cobertura", async () => {
    const mockOutput: CvAdaptationOutput = {
      summary: "CV com chave inventada.",
      sections: [],
      highlightedSkills: [],
      removedSections: [],
      requirementAdaptationActions: [
        {
          requirementKey: "sql-analytics",
          action: "strengthened",
          whereChanged: ["Experiencia"],
          reason: "ok",
          truthfulnessRisk: "low",
        },
        {
          requirementKey: "invented-key-that-does-not-exist",
          action: "strengthened",
          whereChanged: [],
          reason: "modelo inventou isso",
          truthfulnessRisk: "high",
        },
        {
          requirementKey: "stakeholder-communication",
          action: "preserved",
          whereChanged: [],
          reason: "mantido",
          truthfulnessRisk: "low",
        },
      ],
    };

    const client = makeAdaptMockClient(mockOutput);
    const { output } = await adaptCv(client, "gpt-4o-mini", {
      masterCvText: "SQL avancado e comunicacao.",
      jobDescriptionText: "Vaga com SQL e stakeholders.",
      requirementCoverage: sampleCoverage,
    });

    const actions = output.requirementAdaptationActions ?? [];
    const keys = actions.map((a) => a.requirementKey);

    assert.equal(
      actions.length,
      2,
      "apenas as 2 chaves validas devem aparecer",
    );
    assert.ok(
      !keys.includes("invented-key-that-does-not-exist"),
      "chave inventada deve ser descartada",
    );
    assert.ok(
      keys.includes("sql-analytics"),
      "sql-analytics deve estar presente",
    );
    assert.ok(
      keys.includes("stakeholder-communication"),
      "stakeholder-communication deve estar presente",
    );
  });

  it("sem requirementCoverage — output nao inclui requirementAdaptationActions", async () => {
    const mockOutput: CvAdaptationOutput = {
      summary: "CV sem cobertura.",
      sections: [],
      highlightedSkills: [],
      removedSections: [],
    };

    const client = makeAdaptMockClient(mockOutput);
    const { output } = await adaptCv(client, "gpt-4o-mini", {
      masterCvText: "CV generico.",
      jobDescriptionText: "Vaga generica.",
    });

    assert.ok(
      !output.requirementAdaptationActions ||
        output.requirementAdaptationActions.length === 0,
      "sem coverage, requirementAdaptationActions deve ser vazio ou ausente",
    );
  });
});

// ---------------------------------------------------------------------------
// Smoke tests — "CV Adaptado entrega os pontos prometidos na análise"
//
// Validam que o mecanismo de geração guiada DISPARA corretamente:
// o prompt enviado ao modelo contém os blocos de régua e cobertura, e que
// o output final mapeia cada requisito prometido na análise.
// ---------------------------------------------------------------------------

type CapturedCall = { messages: { role: string; content: string }[] };

function makeCapturingClient(response: CvAdaptationOutput) {
  const calls: CapturedCall[] = [];
  const fullResponse: CvAdaptationOutput = {
    adaptationNotes: "Notas stub.",
    ...response,
    sections: response.sections.length ? response.sections : [stubSection],
  };
  const client = {
    chat: {
      completions: {
        create: mock.fn(async (args: CapturedCall) => {
          calls.push(args);
          return {
            choices: [{ message: { content: JSON.stringify(fullResponse) } }],
          };
        }),
      },
    },
  } as unknown as OpenAI;
  return { client, calls };
}

describe("adaptCv — smoke: prompt com régua de requisitos", () => {
  it("user message inclui <REGUA_REQUISITOS> e <COBERTURA_ANALISE> quando coverage é fornecida", async () => {
    const { client, calls } = makeCapturingClient({
      summary: "CV adaptado com régua.",
      sections: [],
      highlightedSkills: [],
      removedSections: [],
      requirementAdaptationActions: sampleCoverage.map((r) => ({
        requirementKey: r.requirementKey,
        action: "strengthened" as const,
        whereChanged: ["Experiência Profissional"],
        reason: "Adicionado conforme lacuna identificada na análise",
        truthfulnessRisk: "low" as const,
      })),
    });

    await adaptCv(client, "gpt-4o-mini", {
      masterCvText: "SQL basico. Analista junior.",
      jobDescriptionText: "Vaga com SQL avancado e comunicacao executiva.",
      requirementCoverage: sampleCoverage,
    });

    assert.equal(
      calls.length,
      1,
      "deve ter feito exatamente uma chamada ao modelo",
    );
    const userMsg =
      calls[0]?.messages.find((m) => m.role === "user")?.content ?? "";

    assert.ok(
      userMsg.includes("<REGUA_REQUISITOS>"),
      "user message deve conter <REGUA_REQUISITOS>",
    );
    assert.ok(
      userMsg.includes("<COBERTURA_ANALISE>"),
      "user message deve conter <COBERTURA_ANALISE>",
    );
    assert.ok(
      userMsg.includes("sql-analytics"),
      "user message deve conter a chave sql-analytics na régua",
    );
    assert.ok(
      userMsg.includes("stakeholder-communication"),
      "user message deve conter a chave stakeholder-communication na régua",
    );
    assert.ok(
      userMsg.includes("partial"),
      "cobertura deve expor o status partial de sql-analytics",
    );
    assert.ok(
      userMsg.includes("missing"),
      "cobertura deve expor o status missing de stakeholder-communication",
    );
  });

  it("user message NÃO inclui blocos XML quando coverage é ausente (backward compat)", async () => {
    const { client, calls } = makeCapturingClient({
      summary: "CV genérico.",
      sections: [],
      highlightedSkills: [],
      removedSections: [],
    });

    await adaptCv(client, "gpt-4o-mini", {
      masterCvText: "CV genérico.",
      jobDescriptionText: "Vaga generica.",
    });

    const userMsg =
      calls[0]?.messages.find((m) => m.role === "user")?.content ?? "";

    assert.ok(
      !userMsg.includes("<REGUA_REQUISITOS>"),
      "sem coverage, nao deve incluir <REGUA_REQUISITOS>",
    );
    assert.ok(
      !userMsg.includes("<COBERTURA_ANALISE>"),
      "sem coverage, nao deve incluir <COBERTURA_ANALISE>",
    );
  });

  it("gaps high+missing aparecem na cobertura enviada ao modelo e são mapeados no output", async () => {
    const coverageComGapCritico: JobRequirementCoverage[] = [
      {
        requirementKey: "python-ml",
        requirementText: "Python para machine learning",
        importance: "high",
        coverageStatus: "missing",
        evidence: [],
        gapExplanation: "Sem mencao a Python ou ML no CV",
        recommendation:
          "Incluir experiencias reais com Python e ML se existirem",
        impactScore: 22,
      },
      {
        requirementKey: "comunicacao-executiva",
        requirementText: "Apresentacao de resultados para C-level",
        importance: "high",
        coverageStatus: "covered",
        evidence: ["Apresentou resultados trimestrais para VP"],
        gapExplanation: "",
        recommendation: "Manter destaque",
        impactScore: 20,
      },
    ];

    const { client, calls } = makeCapturingClient({
      summary: "CV guiado por analise.",
      sections: [],
      highlightedSkills: [],
      removedSections: [],
      requirementAdaptationActions: [
        {
          requirementKey: "python-ml",
          action: "strengthened",
          whereChanged: ["Projetos"],
          reason:
            "Usuario selecionou Python como keyword missing; incluido em Projetos",
          truthfulnessRisk: "medium",
        },
        {
          requirementKey: "comunicacao-executiva",
          action: "preserved",
          whereChanged: [],
          reason: "Ja coberto com evidencia suficiente",
          truthfulnessRisk: "low",
        },
      ],
    });

    await adaptCv(client, "gpt-4o-mini", {
      masterCvText: "Analista com experiencias em apresentacoes corporativas.",
      jobDescriptionText: "Vaga de ML Engineer com comunicacao executiva.",
      requirementCoverage: coverageComGapCritico,
    });

    const userMsg =
      calls[0]?.messages.find((m) => m.role === "user")?.content ?? "";

    // Verifica que o gap critico (high+missing) esta visivel no prompt
    assert.ok(
      userMsg.includes("python-ml"),
      "chave high+missing deve estar no prompt",
    );
    assert.ok(
      userMsg.includes("missing"),
      "status missing deve constar na cobertura",
    );
    assert.ok(
      userMsg.includes("Sem mencao"),
      "gapExplanation deve constar na cobertura",
    );

    // Verifica que o requisito coberto tambem esta presente (para preservacao)
    assert.ok(
      userMsg.includes("comunicacao-executiva"),
      "chave covered deve estar no prompt",
    );
    assert.ok(userMsg.includes("covered"), "status covered deve constar");

    // Verifica que o output mapeia os dois requisitos prometidos
    const { output } = await adaptCv(client, "gpt-4o-mini", {
      masterCvText: "Analista com experiencias em apresentacoes corporativas.",
      jobDescriptionText: "Vaga de ML Engineer com comunicacao executiva.",
      requirementCoverage: coverageComGapCritico,
    });

    const actions = output.requirementAdaptationActions ?? [];
    const keys = actions.map((a) => a.requirementKey);
    assert.ok(keys.includes("python-ml"), "output deve mapear python-ml");
    assert.ok(
      keys.includes("comunicacao-executiva"),
      "output deve mapear comunicacao-executiva",
    );

    const gap = actions.find((a) => a.requirementKey === "python-ml");
    assert.equal(
      gap?.action,
      "strengthened",
      "gap high+missing deve ser strengthened no output",
    );

    const preserved = actions.find(
      (a) => a.requirementKey === "comunicacao-executiva",
    );
    assert.equal(
      preserved?.action,
      "preserved",
      "requisito covered deve ser preserved no output",
    );
  });

  it("todos os requirementKeys da análise aparecem no output — nenhum requisito prometido é omitido", async () => {
    // Simula modelo que retorna apenas 1 de 3 chaves esperadas
    const coverageCompleta: JobRequirementCoverage[] = [
      {
        requirementKey: "req-a",
        requirementText: "Requisito A",
        importance: "high",
        coverageStatus: "missing",
        evidence: [],
        gapExplanation: "Ausente",
        recommendation: "Incluir",
        impactScore: 20,
      },
      {
        requirementKey: "req-b",
        requirementText: "Requisito B",
        importance: "medium",
        coverageStatus: "partial",
        evidence: ["Algo"],
        gapExplanation: "Parcial",
        recommendation: "Fortalecer",
        impactScore: 12,
      },
      {
        requirementKey: "req-c",
        requirementText: "Requisito C",
        importance: "low",
        coverageStatus: "covered",
        evidence: ["Tudo certo"],
        gapExplanation: "",
        recommendation: "Manter",
        impactScore: 5,
      },
    ];

    // Modelo "preguicoso" — retorna apenas req-a
    const { client } = makeCapturingClient({
      summary: "CV com gaps.",
      sections: [],
      highlightedSkills: [],
      removedSections: [],
      requirementAdaptationActions: [
        {
          requirementKey: "req-a",
          action: "strengthened",
          whereChanged: ["Resumo"],
          reason: "Adicionado",
          truthfulnessRisk: "low",
        },
      ],
    });

    const { output } = await adaptCv(client, "gpt-4o-mini", {
      masterCvText: "CV com lacunas.",
      jobDescriptionText: "Vaga com 3 requisitos.",
      requirementCoverage: coverageCompleta,
    });

    const actions = output.requirementAdaptationActions ?? [];
    assert.equal(
      actions.length,
      3,
      "normalizer deve garantir uma entrada por requisito prometido na analise",
    );

    const keys = actions.map((a) => a.requirementKey);
    assert.ok(keys.includes("req-a"), "req-a deve estar no output");
    assert.ok(
      keys.includes("req-b"),
      "req-b omitido pelo modelo deve aparecer como not_addressed",
    );
    assert.ok(
      keys.includes("req-c"),
      "req-c omitido pelo modelo deve aparecer como not_addressed",
    );

    const reqB = actions.find((a) => a.requirementKey === "req-b");
    const reqC = actions.find((a) => a.requirementKey === "req-c");
    assert.equal(reqB?.action, "not_addressed");
    assert.equal(reqC?.action, "not_addressed");
  });
});

// ---------------------------------------------------------------------------
// Reanálise em modo cobertura — cenário Camila + Product Owner FinHub
//
// Valida que a reanálise do CV adaptado:
//   1. Não cria novos requisitos fora da régua
//   2. Não cria lacunas fora dos requirements salvos
//   3. ats_keywords.ausentes só vem de missing/partial
//   4. ats_keywords.presentes só vem de covered
//   5. Requirements cobertos não geram lacuna global
//   6. Modelo que reordena requisitos não destrói o mapeamento
// ---------------------------------------------------------------------------

const FINHUB_REQUIREMENTS: StructuredJobRequirement[] = [
  {
    requirementKey: "gestao-backlog-produto",
    requirementText: "Gestão de backlog e priorização de produto",
    importance: "high",
  },
  {
    requirementKey: "metricas-kpi-produto",
    requirementText: "Definição e acompanhamento de métricas e KPIs de produto",
    importance: "high",
  },
  {
    requirementKey: "colaboracao-squads",
    requirementText:
      "Colaboração com squads multidisciplinares (dev, design, dados)",
    importance: "medium",
  },
  {
    requirementKey: "descoberta-usuario",
    requirementText: "Descoberta de usuário e pesquisa qualitativa",
    importance: "medium",
  },
  {
    requirementKey: "fintech-regulatorio",
    requirementText: "Conhecimento de ambiente regulatório fintech/bancário",
    importance: "low",
  },
];

// CV adaptado da Camila — melhorou gestão de backlog e métricas, ainda sem fintech
const CAMILA_ADAPTED_CV = `
Camila Souza — Product Manager
camila@email.com | LinkedIn: camila-souza | São Paulo, SP

RESUMO PROFISSIONAL
Product Manager com 5 anos de experiência liderando roadmap e backlog em produtos B2B SaaS.
Especialista em frameworks de priorização (RICE, ICE, MoSCoW). Conduz sprints de discovery
com entrevistas, testes A/B e análise de funil. Entrega métricas de North Star e OKRs trimestrais
com squads de 8 a 15 pessoas (devs, designers, data analysts).

EXPERIÊNCIA
PM Sênior | FinanceTech Ltda (2022–atual)
- Gerenciou backlog de 120+ histórias, priorizando por impacto no NPS e receita
- Reduziu time-to-market em 30% via refinamento contínuo com squad cross-funcional
- Definiu KPIs de ativação e retenção; aumentou DAU 22% em 6 meses
- Liderou 15 entrevistas de discovery por trimestre com usuários B2B

PM Pleno | StartupX (2020–2022)
- Priorizou roadmap com stakeholders C-level usando dados de uso e pesquisa qualitativa
- Colaborou com squads de design e engenharia em ciclos de 2 semanas

FORMAÇÃO
Bacharelado em Administração | USP (2019)

HABILIDADES
Product discovery, backlog management, OKRs, Jira, Mixpanel, SQL básico
`.trim();

const FINHUB_JOB =
  "Product Owner — FinHub Pagamentos. Responsável por backlog, métricas de produto e colaboração com squads. Desejável: conhecimento regulatório fintech.";

function makeAnalysisMockClient(output: Record<string, unknown>) {
  return {
    chat: {
      completions: {
        create: mock.fn(async () => ({
          choices: [{ message: { content: JSON.stringify(output) } }],
        })),
      },
    },
  } as unknown as OpenAI;
}

function buildAnalysisOutput(overrides: {
  requirementsFromModel: JobRequirementCoverage[];
  atsPresentesFromModel?: string[];
  atsAusentesFromModel?: string[];
  palavrasAusentesFromModel?: string[];
}) {
  return {
    vaga: { cargo: "Product Owner", empresa: "FinHub Pagamentos" },
    requirements: overrides.requirementsFromModel,
    fit: {
      score: 74,
      score_pos_ajustes: 85,
      categoria: "medio",
      headline: "Boa aderência técnica; lacuna regulatória",
      subheadline:
        "Backlog e métricas fortes; sem experiência fintech documentada",
    },
    secoes: {
      experiencia: { score: 30, max: 40 },
      competencias: { score: 28, max: 40 },
      formatacao: { score: 16, max: 20 },
    },
    positivos: [
      { texto: "Gestão de backlog comprovada", pontos: 12 },
      { texto: "Métricas e OKRs documentados", pontos: 10 },
    ],
    ajustes_conteudo: [
      {
        titulo: "Discovery regulatório fintech",
        descricao: "Sem menção a ambiente regulatório bancário",
        pontos: 6,
        dica: "Incluir se tiver experiência com compliance ou regulação",
      },
    ],
    ajustes_indisponiveis: [],
    keywords: {
      presentes: [
        { kw: "backlog management", pontos: 8 },
        { kw: "KPIs", pontos: 7 },
      ],
      ausentes: (
        overrides.palavrasAusentesFromModel ?? [
          "regulatório fintech",
          "Open Finance",
        ]
      ).map((kw, index) => ({ kw, pontos: index === 0 ? 6 : 5 })),
    },
    formato_cv: {
      ats_score: 78,
      resumo: "CV bem estruturado",
      problemas: [],
      campos: [
        { nome: "Nome completo", presente: true },
        { nome: "E-mail", presente: true },
        { nome: "Telefone", presente: false },
        { nome: "LinkedIn", presente: true },
        { nome: "Localização", presente: true },
        { nome: "Resumo profissional", presente: true },
        { nome: "Formação acadêmica", presente: true },
        { nome: "Experiências com datas", presente: true },
        { nome: "Habilidades e Competências", presente: true },
      ],
    },
    comparacao: {
      antes: "CV genérico de PM",
      depois: "CV focado em produto financeiro",
    },
    preview: {
      antes: "Product Manager generalista",
      depois: "PM com foco em backlog e métricas B2B",
    },
    pontos_fortes: [
      "Gestão de backlog comprovada",
      "Métricas e OKRs documentados",
    ],
    lacunas: ["Discovery regulatório fintech"],
    melhorias_aplicadas: ["Backlog priorizado por impacto"],
    ats_keywords: {
      presentes: overrides.atsPresentesFromModel ?? [
        "backlog management",
        "KPIs",
      ],
      ausentes: overrides.atsAusentesFromModel ?? [
        "regulatório fintech",
        "Open Finance",
      ],
    },
    projecao_melhoria: {
      score_atual: 74,
      score_pos_otimizacao: 85,
      explicacao_curta: "Ajuste regulatório melhora fit",
    },
    mensagem_venda: {
      titulo: "PM pronto para fintech",
      subtexto: "Backlog e métricas já comprovados",
    },
  };
}

describe("analyzeAndAdaptCv — reanálise Camila + Product Owner FinHub", () => {
  it("reanálise não cria novos requirementKeys fora da régua salva", async () => {
    // Modelo retorna os requisitos na mesma ordem com cobertura atualizada
    const modelRequirements: JobRequirementCoverage[] = FINHUB_REQUIREMENTS.map(
      (r) => ({
        ...r,
        coverageStatus:
          r.requirementKey === "fintech-regulatorio" ? "missing" : "covered",
        evidence:
          r.requirementKey !== "fintech-regulatorio"
            ? ["Evidência presente no CV adaptado"]
            : [],
        gapExplanation:
          r.requirementKey === "fintech-regulatorio"
            ? "Sem experiência regulatória documentada"
            : "",
        recommendation:
          r.requirementKey === "fintech-regulatorio"
            ? "Incluir se tiver experiência real com compliance"
            : "",
        impactScore:
          r.importance === "high" ? 20 : r.importance === "medium" ? 12 : 6,
      }),
    );

    const client = makeAnalysisMockClient(
      buildAnalysisOutput({ requirementsFromModel: modelRequirements }),
    );

    const output = await analyzeAndAdaptCv(client, "gpt-4o-mini", {
      masterCvText: CAMILA_ADAPTED_CV,
      jobDescriptionText: FINHUB_JOB,
      canonicalJobJson: {
        title: "Product Owner",
        company: "FinHub Pagamentos",
      },
      existingRequirements: FINHUB_REQUIREMENTS,
    });

    const outputKeys = output.requirements.map((r) => r.requirementKey);
    const ruleKeys = FINHUB_REQUIREMENTS.map((r) => r.requirementKey);

    assert.deepEqual(
      outputKeys,
      ruleKeys,
      "requirementKeys devem ser idênticos à régua salva",
    );
  });

  it("reanálise não gera lacunas fora dos requirements missing/partial", async () => {
    const modelRequirements: JobRequirementCoverage[] = FINHUB_REQUIREMENTS.map(
      (r) => ({
        ...r,
        coverageStatus:
          r.requirementKey === "fintech-regulatorio" ? "missing" : "covered",
        evidence:
          r.requirementKey !== "fintech-regulatorio" ? ["Evidência no CV"] : [],
        gapExplanation:
          r.requirementKey === "fintech-regulatorio"
            ? "Sem experiência regulatória"
            : "",
        recommendation: "",
        impactScore: 10,
      }),
    );

    const client = makeAnalysisMockClient(
      buildAnalysisOutput({ requirementsFromModel: modelRequirements }),
    );

    const output = await analyzeAndAdaptCv(client, "gpt-4o-mini", {
      masterCvText: CAMILA_ADAPTED_CV,
      jobDescriptionText: FINHUB_JOB,
      canonicalJobJson: {
        title: "Product Owner",
        company: "FinHub Pagamentos",
      },
      existingRequirements: FINHUB_REQUIREMENTS,
    });

    // Lacunas só podem vir de missing/partial
    const missingOrPartialKeys = output.requirements
      .filter(
        (r) => r.coverageStatus === "missing" || r.coverageStatus === "partial",
      )
      .map((r) => r.requirementKey);

    assert.equal(
      missingOrPartialKeys.length,
      1,
      "apenas fintech-regulatorio deve estar como missing/partial",
    );
    assert.ok(
      missingOrPartialKeys.includes("fintech-regulatorio"),
      "fintech-regulatorio deve estar como missing",
    );

    // Requirements covered não podem gerar lacuna
    const coveredKeys = output.requirements
      .filter((r) => r.coverageStatus === "covered")
      .map((r) => r.requirementKey);

    for (const key of coveredKeys) {
      const req = output.requirements.find((r) => r.requirementKey === key);
      assert.equal(
        req?.gapExplanation,
        "",
        `requirement coberto ${key} não deve ter gapExplanation`,
      );
    }

    // lacunas globais devem ter exatamente 1 item (do fintech-regulatorio)
    assert.equal(
      output.lacunas.length,
      1,
      "lacunas globais devem refletir apenas os requirements missing/partial",
    );
  });

  it("ats_keywords.ausentes deriva apenas de requirements missing/partial, não do modelo", async () => {
    // Modelo tenta colocar keywords livres em ats_keywords — deve ser ignorado
    const modelRequirements: JobRequirementCoverage[] = FINHUB_REQUIREMENTS.map(
      (r) => ({
        ...r,
        coverageStatus:
          r.requirementKey === "fintech-regulatorio" ? "missing" : "covered",
        evidence: [],
        gapExplanation: "",
        recommendation: "",
        impactScore: 10,
      }),
    );

    const client = makeAnalysisMockClient(
      buildAnalysisOutput({
        requirementsFromModel: modelRequirements,
        // Modelo tenta colocar keywords inventadas fora da régua
        atsAusentesFromModel: [
          "Open Finance",
          "Pix",
          "LGPD",
          "regulatório fintech",
        ],
        atsPresentesFromModel: ["backlog", "KPIs", "OKR"],
      }),
    );

    const output = await analyzeAndAdaptCv(client, "gpt-4o-mini", {
      masterCvText: CAMILA_ADAPTED_CV,
      jobDescriptionText: FINHUB_JOB,
      canonicalJobJson: {
        title: "Product Owner",
        company: "FinHub Pagamentos",
      },
      existingRequirements: FINHUB_REQUIREMENTS,
    });

    // ats_keywords.ausentes deve ser derivado apenas dos requirements missing/partial
    const expectedAusentes = FINHUB_REQUIREMENTS.filter(
      (r) => r.requirementKey === "fintech-regulatorio",
    ).map((r) => r.requirementText);

    assert.deepEqual(
      output.ats_keywords.ausentes,
      expectedAusentes,
      "ats_keywords.ausentes deve conter apenas requirementText dos requirements missing/partial",
    );

    // ats_keywords.presentes deve conter apenas os covered
    const expectedPresentes = FINHUB_REQUIREMENTS.filter(
      (r) => r.requirementKey !== "fintech-regulatorio",
    ).map((r) => r.requirementText);

    assert.deepEqual(
      output.ats_keywords.presentes,
      expectedPresentes,
      "ats_keywords.presentes deve conter apenas requirementText dos requirements covered",
    );
  });

  it("modelo que reordena requisitos não quebra o mapeamento de chaves", async () => {
    // Modelo retorna requisitos em ordem invertida
    const modelRequirementsReordered: JobRequirementCoverage[] = [
      ...FINHUB_REQUIREMENTS,
    ]
      .reverse()
      .map((r) => ({
        ...r,
        coverageStatus:
          r.requirementKey === "fintech-regulatorio" ? "missing" : "covered",
        evidence: [],
        gapExplanation: "",
        recommendation: "",
        impactScore: 10,
      }));

    const client = makeAnalysisMockClient(
      buildAnalysisOutput({
        requirementsFromModel: modelRequirementsReordered,
      }),
    );

    const output = await analyzeAndAdaptCv(client, "gpt-4o-mini", {
      masterCvText: CAMILA_ADAPTED_CV,
      jobDescriptionText: FINHUB_JOB,
      canonicalJobJson: {
        title: "Product Owner",
        company: "FinHub Pagamentos",
      },
      existingRequirements: FINHUB_REQUIREMENTS,
    });

    // Output deve estar na ordem da régua, não do modelo
    const outputKeys = output.requirements.map((r) => r.requirementKey);
    const ruleKeys = FINHUB_REQUIREMENTS.map((r) => r.requirementKey);
    assert.deepEqual(
      outputKeys,
      ruleKeys,
      "ordem da régua deve ser preservada mesmo com modelo reordenando",
    );

    // requirementText e importance devem vir da régua, não do modelo
    for (const [i, req] of output.requirements.entries()) {
      const rule = FINHUB_REQUIREMENTS[i];
      assert.equal(
        req.requirementText,
        rule.requirementText,
        `requirementText[${i}] deve vir da régua`,
      );
      assert.equal(
        req.importance,
        rule.importance,
        `importance[${i}] deve vir da régua`,
      );
    }

    // Coverage do fintech-regulatorio deve ter sido mantida mesmo após reordenação
    const fintech = output.requirements.find(
      (r) => r.requirementKey === "fintech-regulatorio",
    );
    assert.equal(
      fintech?.coverageStatus,
      "missing",
      "coverage do fintech-regulatorio deve ser preservada após reordenação",
    );
  });

  it("modelo que omite um requirementKey recebe coverageStatus covered por padrão", async () => {
    // Modelo não retorna o requirementKey "descoberta-usuario"
    const modelRequirementsIncomplete: JobRequirementCoverage[] =
      FINHUB_REQUIREMENTS.filter(
        (r) => r.requirementKey !== "descoberta-usuario",
      ).map((r) => ({
        ...r,
        coverageStatus:
          r.requirementKey === "fintech-regulatorio" ? "missing" : "covered",
        evidence: [],
        gapExplanation: "",
        recommendation: "",
        impactScore: 10,
      }));

    const client = makeAnalysisMockClient(
      buildAnalysisOutput({
        requirementsFromModel: modelRequirementsIncomplete,
      }),
    );

    const output = await analyzeAndAdaptCv(client, "gpt-4o-mini", {
      masterCvText: CAMILA_ADAPTED_CV,
      jobDescriptionText: FINHUB_JOB,
      canonicalJobJson: {
        title: "Product Owner",
        company: "FinHub Pagamentos",
      },
      existingRequirements: FINHUB_REQUIREMENTS,
    });

    // Todos os 5 requisitos da régua devem aparecer no output
    assert.equal(
      output.requirements.length,
      FINHUB_REQUIREMENTS.length,
      "todos os requisitos da régua devem aparecer",
    );

    // O requisito omitido pelo modelo deve ter coverageStatus covered (conservador)
    const omitted = output.requirements.find(
      (r) => r.requirementKey === "descoberta-usuario",
    );
    assert.ok(
      omitted,
      "descoberta-usuario deve aparecer no output mesmo omitido pelo modelo",
    );
    assert.equal(
      omitted?.coverageStatus,
      "covered",
      "requisito omitido pelo modelo recebe covered por padrão",
    );

    // requirementText e importance do omitido devem vir da régua
    const rule = FINHUB_REQUIREMENTS.find(
      (r) => r.requirementKey === "descoberta-usuario",
    );
    assert.equal(
      omitted?.requirementText,
      rule?.requirementText,
      "requirementText do omitido deve vir da régua",
    );
  });

  it("reanálise promove keywords históricas quando elas aparecem nas evidências atuais", async () => {
    const existingKeywordRule = {
      presentes: [{ kw: "roadmap", pontos: 5 }],
      possiveis: [{ kw: "produto digital", pontos: 1 }],
      ausentes: [
        { kw: "histórias de usuário", pontos: 5 },
        { kw: "critérios de aceite", pontos: 5 },
        { kw: "mercado financeiro", pontos: 1 },
      ],
    };

    const modelRequirements: JobRequirementCoverage[] = FINHUB_REQUIREMENTS.map(
      (requirement) => {
        if (requirement.requirementKey === "descoberta-usuario") {
          return {
            ...requirement,
            coverageStatus: "partial",
            evidence: [
              "conhecimento em histórias de usuário",
              "conhecimento em critérios de aceite",
            ],
            gapExplanation: "",
            recommendation: "",
            impactScore: 10,
          };
        }

        if (requirement.requirementKey === "fintech-regulatorio") {
          return {
            ...requirement,
            coverageStatus: "partial",
            evidence: ["mercado financeiro"],
            gapExplanation: "",
            recommendation: "",
            impactScore: 6,
          };
        }

        return {
          ...requirement,
          coverageStatus: "covered",
          evidence: ["Cobertura presente no CV"],
          gapExplanation: "",
          recommendation: "",
          impactScore: 10,
        };
      },
    );

    const client = makeAnalysisMockClient(
      buildAnalysisOutput({
        requirementsFromModel: modelRequirements,
        palavrasAusentesFromModel: [
          "histórias de usuário",
          "critérios de aceite",
          "mercado financeiro",
        ],
      }),
    );

    const output = await analyzeAndAdaptCv(client, "gpt-4o-mini", {
      masterCvText: CAMILA_ADAPTED_CV,
      jobDescriptionText: FINHUB_JOB,
      canonicalJobJson: {
        title: "Product Owner",
        company: "FinHub Pagamentos",
      },
      existingRequirements: FINHUB_REQUIREMENTS,
      existingKeywordRule,
    });

    const presentes = output.keywords.presentes.map((item) => item.kw);
    const ausentes = output.keywords.ausentes.map((item) => item.kw);

    assert.ok(
      presentes.includes("histórias de usuário"),
      "histórias de usuário deve sair de ausentes quando já aparece nas evidências",
    );
    assert.ok(
      presentes.includes("critérios de aceite"),
      "critérios de aceite deve sair de ausentes quando já aparece nas evidências",
    );
    assert.ok(
      presentes.includes("mercado financeiro"),
      "mercado financeiro deve sair de ausentes quando já aparece nas evidências",
    );
    assert.ok(
      !ausentes.includes("histórias de usuário") &&
        !ausentes.includes("critérios de aceite") &&
        !ausentes.includes("mercado financeiro"),
      "keywords reaproveitadas no CV atual não podem continuar em ausentes",
    );
    assert.deepEqual(
      ausentes,
      [],
      "reanálise com régua congelada não pode repovoar ausentes com frases de requirements",
    );
  });
});
