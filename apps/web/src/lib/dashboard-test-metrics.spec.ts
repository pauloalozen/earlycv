import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeData } from "@/app/adaptar/resultado/normalize-data";
import type { CvAnalysisData } from "@/lib/cv-adaptation-api";
import {
  buildDashboardTestHistoryView,
  buildDashboardTestMetrics,
  extractDashboardAnalysisSignal,
  getDashboardScoreColor,
} from "./dashboard-test-metrics";

const INPUT = [
  { id: "a1", score: 80, improvement: 14 },
  { id: "a2", score: 76, improvement: 10 },
];

test("buildDashboardTestMetrics returns computed values", () => {
  const result = buildDashboardTestMetrics(INPUT);

  assert.equal(result.averageScore, 78);
  assert.equal(result.highCompatibilityCount, 1);
  assert.equal(result.evolutionPercentage, 12);
});

test("buildDashboardTestHistoryView adds score and improvement", () => {
  const item = buildDashboardTestHistoryView(INPUT[0]);

  assert.equal(typeof item.score, "number");
  assert.equal(typeof item.improvement, "number");
});

function makeAnalysisPayload(): CvAnalysisData {
  return {
    vaga: { cargo: "Analista", empresa: "EarlyCV" },
    fit: {
      score: 1,
      categoria: "medio",
      headline: "headline",
      subheadline: "subheadline",
    },
    positivos: [{ texto: "xp relevante", pontos: 20 }],
    ajustes_conteudo: [
      {
        id: "a1",
        titulo: "Ajustar bullets",
        descricao: "",
        pontos: 10,
        dica: "",
      },
    ],
    ajustes_indisponiveis: [
      {
        id: "i1",
        titulo: "Sem ingles avancado",
        descricao: "",
        pontos: 10,
        dica: "",
      },
    ],
    keywords: {
      presentes: [{ kw: "SQL", pontos: 25 }],
      ausentes: [{ kw: "Python", pontos: 15 }],
    },
    formato_cv: {
      resumo: "ok",
      problemas: [
        { tipo: "atencao", titulo: "Resumo longo", descricao: "", impacto: 4 },
      ],
      campos: [
        { nome: "Telefone", presente: false },
        { nome: "LinkedIn", presente: false },
        { nome: "Nome completo", presente: true },
      ],
    },
    comparacao: { antes: "", depois: "" },
    pontos_fortes: [],
    lacunas: [],
    melhorias_aplicadas: [],
    ats_keywords: { presentes: [], ausentes: [] },
    preview: { antes: "", depois: "" },
    projecao_melhoria: {
      score_atual: 88,
      score_pos_otimizacao: 99,
      explicacao_curta: "",
    },
    mensagem_venda: { titulo: "", subtexto: "" },
  } as unknown as CvAnalysisData;
}

test("extractDashboardAnalysisSignal returns final score from normalized CV calculation", () => {
  const payload = makeAnalysisPayload();
  const normalized = normalizeData(payload);
  const signal = extractDashboardAnalysisSignal(payload);

  assert.equal(signal.score, normalized.score.scoreAposLiberarBase);
  assert.equal(
    signal.improvement,
    normalized.score.scoreAposLiberarBase - normalized.score.scoreAtualBase,
  );
});

test("extractDashboardAnalysisSignal uses normalized final score instead of raw fit score", () => {
  const payload = makeAnalysisPayload();
  payload.fit.score = 99;
  payload.fit.score_pos_ajustes = 99;
  const normalized = normalizeData(payload);
  const signal = extractDashboardAnalysisSignal(payload);

  assert.equal(signal.score, normalized.score.scoreAposLiberarBase);
  assert.notEqual(signal.score, 99);
});

test("extractDashboardAnalysisSignal adds selected missing keywords to final score", () => {
  const payload = makeAnalysisPayload() as CvAnalysisData & {
    selectedMissingKeywords?: string[];
  };
  payload.selectedMissingKeywords = ["Python"];
  const normalized = normalizeData(payload);
  const selectedKwPoints = normalized.keywords.ausentes
    .filter((item) => item.kw === "Python")
    .reduce((sum, item) => sum + item.pontos, 0);
  const expectedFinal = Math.min(
    100,
    normalized.score.scoreAposLiberarBase + selectedKwPoints,
  );

  const signal = extractDashboardAnalysisSignal(payload);

  assert.equal(signal.score, expectedFinal);
});

test("extractDashboardAnalysisSignal exposes adjustments popup payload", () => {
  const payload = makeAnalysisPayload();
  payload.adaptation_notes = "Ajustes aplicados no CV";
  const normalized = normalizeData(payload);
  const signal = extractDashboardAnalysisSignal(payload);

  assert.equal(signal.adjustments.scoreBefore, normalized.score.scoreAtualBase);
  assert.equal(
    signal.adjustments.scoreFinal,
    normalized.score.scoreAposLiberarBase,
  );
  assert.equal(signal.adjustments.notes, "Ajustes aplicados no CV");
});

test("getDashboardScoreColor follows score thresholds", () => {
  assert.equal(getDashboardScoreColor(49), "#dc2626");
  assert.equal(getDashboardScoreColor(60), "#ca8a04");
  assert.equal(getDashboardScoreColor(100), "rgb(22, 163, 74)");
});
