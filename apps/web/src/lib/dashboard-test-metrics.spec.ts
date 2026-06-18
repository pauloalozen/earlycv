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

test("extractDashboardAnalysisSignal returns delivered score (no keywords selected)", () => {
  const payload = makeAnalysisPayload();
  const normalized = normalizeData(payload);
  // Without selected keywords, score = base + content adjustments + possible keywords (no ausentes)
  const expectedScore = Math.min(
    100,
    normalized.score.scoreAtualBase +
      normalized.score.ajustesConteudoSecao1 +
      normalized.score.keywordsPossiveisTotal,
  );
  const signal = extractDashboardAnalysisSignal(payload);

  assert.equal(signal.score, expectedScore);
  assert.equal(signal.improvement, expectedScore - normalized.score.scoreAtualBase);
});

test("extractDashboardAnalysisSignal resolves historical normalized-analysis payloads consistently", () => {
  const payload = makeAnalysisPayload();
  const normalized = normalizeData(payload);
  // score = scoreAtualBase(58) + ajustesConteudo(10) + kwPossiveis(0) = 68
  const expectedScore = Math.min(
    100,
    normalized.score.scoreAtualBase +
      normalized.score.ajustesConteudoSecao1 +
      normalized.score.keywordsPossiveisTotal,
  );
  const signal = extractDashboardAnalysisSignal(payload);

  assert.equal(signal.adjustments.scoreBefore, 58);
  assert.equal(signal.adjustments.scoreFinal, expectedScore);
  assert.equal(signal.score, expectedScore);
  assert.equal(signal.improvement, expectedScore - 58);
});

test("extractDashboardAnalysisSignal preserves scalar fallback for malformed historical payloads", () => {
  const payload = {
    ...makeAnalysisPayload(),
    fit: {
      score: 41,
      score_pos_ajustes: 83,
      categoria: "medio",
      headline: "headline",
      subheadline: "subheadline",
    },
    positivos: [null],
    projecao_melhoria: {
      score_atual: 62,
      score_pos_otimizacao: 78,
      explicacao_curta: "",
    },
  } as unknown as CvAnalysisData;

  const signal = extractDashboardAnalysisSignal(payload);

  assert.equal(signal.adjustments.scoreBefore, 62);
  assert.equal(signal.adjustments.scoreFinal, 83);
  assert.equal(signal.score, 83);
  assert.equal(signal.improvement, 21);
});

test("extractDashboardAnalysisSignal uses normalized score instead of raw fit score", () => {
  const payload = makeAnalysisPayload();
  payload.fit.score = 99;
  payload.fit.score_pos_ajustes = 99;
  const normalized = normalizeData(payload);
  const expectedScore = Math.min(
    100,
    normalized.score.scoreAtualBase +
      normalized.score.ajustesConteudoSecao1 +
      normalized.score.keywordsPossiveisTotal,
  );
  const signal = extractDashboardAnalysisSignal(payload);

  assert.equal(signal.score, expectedScore);
  assert.notEqual(signal.score, 99);
});

test("extractDashboardAnalysisSignal adds only selected missing keyword points", () => {
  const payload = makeAnalysisPayload() as CvAnalysisData & {
    selectedMissingKeywords?: string[];
  };
  payload.selectedMissingKeywords = ["Python"];
  const normalized = normalizeData(payload);
  // "Python" is in ausentes with 15 pts; should be added on top of base adjustments
  const pythonPts = normalized.keywords.ausentes.find((k) => k.kw === "Python")?.pontos ?? 0;
  const expectedScore = Math.min(
    100,
    normalized.score.scoreAtualBase +
      normalized.score.ajustesConteudoSecao1 +
      normalized.score.keywordsPossiveisTotal +
      pythonPts,
  );

  const signal = extractDashboardAnalysisSignal(payload);

  assert.equal(signal.score, expectedScore);
});

test("extractDashboardAnalysisSignal matches selected keywords case-insensitively", () => {
  const payload = makeAnalysisPayload() as CvAnalysisData & {
    selectedMissingKeywords?: string[];
  };
  (payload.keywords as { ausentes: unknown[] }).ausentes = [{ kw: "Python", pontos: 15 }];
  payload.selectedMissingKeywords = ["python"];

  const normalized = normalizeData(payload);
  const expectedScore = Math.min(
    100,
    normalized.score.scoreAtualBase +
      normalized.score.ajustesConteudoSecao1 +
      normalized.score.keywordsPossiveisTotal +
      15,
  );

  const signal = extractDashboardAnalysisSignal(payload);

  assert.equal(signal.score, expectedScore);
});

test("extractDashboardAnalysisSignal applies runtime selected keywords override", () => {
  const payload = makeAnalysisPayload();
  const normalized = normalizeData(payload);
  const pythonPts = normalized.keywords.ausentes.find((k) => k.kw === "Python")?.pontos ?? 0;
  const expectedScore = Math.min(
    100,
    normalized.score.scoreAtualBase +
      normalized.score.ajustesConteudoSecao1 +
      normalized.score.keywordsPossiveisTotal +
      pythonPts,
  );

  const signal = extractDashboardAnalysisSignal(payload, {
    selectedMissingKeywords: ["Python"],
  });

  assert.equal(signal.score, expectedScore);
});

test("extractDashboardAnalysisSignal exposes adjustments popup payload", () => {
  const payload = makeAnalysisPayload();
  payload.adaptation_notes = "Ajustes aplicados no CV";
  const normalized = normalizeData(payload);
  const expectedScore = Math.min(
    100,
    normalized.score.scoreAtualBase +
      normalized.score.ajustesConteudoSecao1 +
      normalized.score.keywordsPossiveisTotal,
  );
  const signal = extractDashboardAnalysisSignal(payload);

  assert.equal(signal.adjustments.scoreBefore, normalized.score.scoreAtualBase);
  assert.equal(signal.adjustments.scoreFinal, expectedScore);
  assert.equal(signal.adjustments.notes, "Ajustes aplicados no CV");
});

test("getDashboardScoreColor follows score thresholds", () => {
  assert.equal(getDashboardScoreColor(49), "#dc2626");
  assert.equal(getDashboardScoreColor(60), "#ca8a04");
  assert.equal(getDashboardScoreColor(100), "rgb(22, 163, 74)");
});
