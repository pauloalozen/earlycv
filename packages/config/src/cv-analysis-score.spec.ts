import assert from "node:assert/strict";
import test from "node:test";

import { resolveCvAnalysisScores } from "./cv-analysis-score.js";

test("resolveCvAnalysisScores supports requirements_v2 payloads and selected keywords", () => {
  const result = resolveCvAnalysisScores(
    {
      analysisVersion: "requirements_v2",
      vaga: { cargo: "Analista", empresa: "EarlyCV" },
      fit: {
        score: 1,
        score_pos_ajustes: 1,
        categoria: "medio",
        headline: "headline",
        subheadline: "subheadline",
      },
      requirements: [
        {
          requirementKey: "sql",
          requirementText: "SQL",
          importance: "high",
          coverageStatus: "covered",
          evidence: ["Projeto com SQL"],
          gapExplanation: "",
          recommendation: "",
        },
        {
          requirementKey: "python",
          requirementText: "Python",
          importance: "medium",
          coverageStatus: "partial",
          evidence: ["Scripts internos"],
          gapExplanation: "Cobertura parcial",
          recommendation: "Detalhar automacoes reais",
        },
      ],
      scoring: {
        kind: "requirements_v2",
        sections: {
          experiencia: { score: 25, max: 40 },
          competencias: { score: 25, max: 40 },
          formatacao: { score: 20, max: 20 },
        },
        totals: {
          scoreAtualBase: 70,
          scoreAposLiberarBase: 85,
          scoreDelta: 15,
        },
      },
      keywords: {
        presentes: [{ kw: "SQL", pontos: 25 }],
        ausentes: [{ kw: "Python", pontos: 15 }],
      },
      formato_cv: { resumo: "ok", problemas: [], campos: [] },
      comparacao: { antes: "", depois: "" },
      pontos_fortes: [],
      lacunas: [],
      ats_keywords: { presentes: [], ausentes: [] },
      preview: { antes: "", depois: "" },
      projecao_melhoria: {
        score_atual: 0,
        score_pos_otimizacao: 0,
        explicacao_curta: "",
      },
      mensagem_venda: { titulo: "", subtexto: "" },
    },
    { selectedMissingKeywords: ["Python"] },
  );

  assert.equal(result.scoreBefore, 76);
  assert.equal(result.scoreAfter, 100);
  assert.deepEqual(result.selectedMissingKeywords, ["Python"]);
});
