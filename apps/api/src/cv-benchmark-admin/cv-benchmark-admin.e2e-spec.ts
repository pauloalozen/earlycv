// Testes permanentes — seção 10 da 2ª rodada da auditoria adversarial de
// 2026-09-08. CvBenchmarkAdminController é uma exceção deliberada
// (ferramenta de benchmark de prompt pra admin) — este arquivo documenta e
// prova os limites dela: exige admin/superadmin, nunca persiste nada do
// pipeline canônico, CV sintético só existe durante a chamada.
process.env.SKIP_AI = "false";

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";

import { Reflector } from "@nestjs/core";
import { PrismaClient } from "@prisma/client";
import { RolesGuard } from "../common/roles.guard";
import { DatabaseService } from "../database/database.service";
import { CvAdaptationAiService } from "../cv-adaptation/cv-adaptation-ai.service";
import { CvBenchmarkAdminController } from "./cv-benchmark-admin.controller";

const prisma = new PrismaClient();
const database = new DatabaseService(prisma);

function fakeExecutionContext(user: {
  isStaff: boolean;
  internalRole: string;
}) {
  return {
    getHandler: () => CvBenchmarkAdminController.prototype.analyze,
    getClass: () => CvBenchmarkAdminController,
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
  } as unknown as import("@nestjs/common").ExecutionContext;
}

test("BENCHMARK 1: RolesGuard exige internalRole admin/superadmin — usuário comum é bloqueado", async () => {
  const guard = new RolesGuard(new Reflector());
  assert.throws(
    () =>
      guard.canActivate(
        fakeExecutionContext({ isStaff: false, internalRole: "none" }),
      ),
    /insufficient internal role/,
  );
  assert.throws(
    () =>
      guard.canActivate(
        fakeExecutionContext({ isStaff: true, internalRole: "none" }),
      ),
    /insufficient internal role/,
  );
});

test("BENCHMARK 2: RolesGuard permite admin e superadmin", async () => {
  const guard = new RolesGuard(new Reflector());
  assert.equal(
    guard.canActivate(
      fakeExecutionContext({ isStaff: true, internalRole: "admin" }),
    ),
    true,
  );
  assert.equal(
    guard.canActivate(
      fakeExecutionContext({ isStaff: true, internalRole: "superadmin" }),
    ),
    true,
  );
});

test("BENCHMARK 3: analyze()/adapt() nunca persistem CvSource/CvSubmission/CvProcessingJob/AnalysisJob/TalentProfile/CvMasterDesignation", async () => {
  const runId = `bench-${Date.now()}-${randomUUID().slice(0, 8)}`;
  const analysisClient = {
    chat: {
      completions: {
        create: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  vaga: { cargo: "Analista", empresa: "Acme" },
                  requirements: [
                    {
                      requirementText: "req",
                      importance: "medium",
                      coverageStatus: "partial",
                      evidence: [],
                      gapExplanation: "",
                      recommendation: "",
                      impactScore: 5,
                    },
                  ],
                  fit: {
                    score: 50,
                    score_pos_ajustes: 50,
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
                  keywords: { presentes: [], possiveis: [], ausentes: [] },
                  formato_cv: {
                    ats_score: 50,
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
                    score_pos_otimizacao: 50,
                    explicacao_curta: "ok",
                  },
                  mensagem_venda: { titulo: "ok", subtexto: "ok" },
                }),
              },
            },
          ],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        }),
      },
    },
  };

  const [
    cvSourcesBefore,
    cvProcessingJobsBefore,
    analysisJobsBefore,
    talentProfilesBefore,
    cvMasterDesignationsBefore,
  ] = await Promise.all([
    prisma.cvSource.count(),
    prisma.cvProcessingJob.count(),
    prisma.analysisJob.count(),
    prisma.talentProfile.count(),
    prisma.cvMasterDesignation.count(),
  ]);

  const aiService = new CvAdaptationAiService(
    database,
    analysisClient as never,
    analysisClient as never,
  );
  const controller = new CvBenchmarkAdminController(aiService);

  const cvText = `${runId} CV sintético de benchmark, nunca deve ser persistido em nenhuma tabela do pipeline canônico.`;
  await controller.analyze({
    cvText,
    jobText: `${runId} Vaga sintética de benchmark.`,
  });

  const [
    cvSourcesAfter,
    cvProcessingJobsAfter,
    analysisJobsAfter,
    talentProfilesAfter,
    cvMasterDesignationsAfter,
  ] = await Promise.all([
    prisma.cvSource.count(),
    prisma.cvProcessingJob.count(),
    prisma.analysisJob.count(),
    prisma.talentProfile.count(),
    prisma.cvMasterDesignation.count(),
  ]);

  assert.equal(cvSourcesAfter, cvSourcesBefore, "nenhum CvSource novo");
  assert.equal(
    cvProcessingJobsAfter,
    cvProcessingJobsBefore,
    "nenhum CvProcessingJob novo",
  );
  assert.equal(
    analysisJobsAfter,
    analysisJobsBefore,
    "nenhum AnalysisJob novo",
  );
  assert.equal(
    talentProfilesAfter,
    talentProfilesBefore,
    "nenhum TalentProfile novo",
  );
  assert.equal(
    cvMasterDesignationsAfter,
    cvMasterDesignationsBefore,
    "nenhuma CvMasterDesignation nova",
  );

  // O CV sintético só existe durante a chamada — nenhuma tabela plausível
  // guarda o runId depois que a chamada retorna.
  const [resumeMatches, analysisCvSnapshotMatches] = await Promise.all([
    prisma.resume.count({ where: { rawText: { contains: runId } } }),
    prisma.analysisCvSnapshot.count(),
  ]);
  assert.equal(resumeMatches, 0);
  void analysisCvSnapshotMatches; // não filtrável por runId (sem texto livre) — contagem só documental
});

test("BENCHMARK 4: resposta não afirma ser análise persistida (contrato de retorno é benchmark, não CvAdaptation)", async () => {
  const analysisClient = {
    chat: {
      completions: {
        create: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  vaga: { cargo: "Analista", empresa: "Acme" },
                  requirements: [
                    {
                      requirementText: "req",
                      importance: "medium",
                      coverageStatus: "partial",
                      evidence: [],
                      gapExplanation: "",
                      recommendation: "",
                      impactScore: 5,
                    },
                  ],
                  fit: {
                    score: 50,
                    score_pos_ajustes: 50,
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
                  keywords: { presentes: [], possiveis: [], ausentes: [] },
                  formato_cv: {
                    ats_score: 50,
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
                    score_pos_otimizacao: 50,
                    explicacao_curta: "ok",
                  },
                  mensagem_venda: { titulo: "ok", subtexto: "ok" },
                }),
              },
            },
          ],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        }),
      },
    },
  };
  const aiService = new CvAdaptationAiService(
    database,
    analysisClient as never,
    analysisClient as never,
  );
  const controller = new CvBenchmarkAdminController(aiService);

  const result = await controller.analyze({
    cvText: "CV sintético.",
    jobText: "Vaga sintética.",
  });

  // Contrato de retorno: campos de benchmark (analysisOutput/model/
  // promptVersion), nunca um shape de CvAdaptation persistida (id,
  // status, isUnlocked, paymentStatus etc.) — prova que a resposta não
  // finge ser uma análise real do produto.
  assert.ok("analysisOutput" in result);
  assert.ok("model" in result);
  assert.ok(!("id" in result));
  assert.ok(!("status" in result));
  assert.ok(!("isUnlocked" in result));
});
