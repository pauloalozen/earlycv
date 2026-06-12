import assert from "node:assert/strict";
import test from "node:test";

import { normalizeData } from "./cv-analysis-normalize.js";

test("normalizeData prefers requirement-driven scoring for requirements_v2 payloads", () => {
  const normalized = normalizeData({
    analysisVersion: "requirements_v2",
    vaga: { cargo: "Analista", empresa: "EarlyCV" },
    fit: {
      score: 999,
      score_pos_ajustes: 999,
      categoria: "medio",
      headline: "headline",
      subheadline: "subheadline",
    },
    requirements: [
      {
        requirementKey: "sql",
        requirementText: "Experiencia com SQL",
        importance: "high",
        gateLevel: "hard",
        coverageStatus: "covered",
        evidence: ["Projeto com SQL"],
        gapExplanation: "",
        recommendation: "",
      },
      {
        requirementKey: "python",
        requirementText: "Python para automacao",
        importance: "medium",
        coverageStatus: "partial",
        evidence: ["Automacao interna"],
        gapExplanation: "Python aparece sem profundidade",
        recommendation: "Detalhar scripts e contexto se for verdadeiro",
      },
      {
        requirementKey: "ingles",
        requirementText: "Ingles avancado",
        importance: "low",
        coverageStatus: "missing",
        evidence: [],
        gapExplanation: "Nao ha evidencia de ingles avancado",
        recommendation: "",
      },
    ],
    scoring: {
      kind: "requirements_v2",
      sections: {
        experiencia: { score: 28, max: 50 },
        competencias: { score: 22, max: 40 },
        formatacao: { score: 9, max: 10 },
      },
      totals: {
        scoreAtualBase: 59,
        scoreAposLiberarBase: 67,
        scoreDelta: 8,
      },
    },
    positivos: [],
    ajustes_conteudo: [],
    ajustes_indisponiveis: [],
    keywords: { presentes: [], ausentes: [] },
    formato_cv: {
      resumo: "ok",
      problemas: [
        { tipo: "atencao", titulo: "Resumo longo", descricao: "", impacto: 2 },
      ],
      campos: [
        { nome: "Telefone", presente: true },
        { nome: "LinkedIn", presente: false },
      ],
    },
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
  });

  assert.equal(normalized.secoes.experiencia.score, 30);
  assert.equal(normalized.secoes.competencias.score, 22);
  assert.equal(normalized.secoes.formatacao.score, 9);
  assert.equal(normalized.score.scoreAtualBase, 61);
  assert.equal(normalized.score.scoreAposLiberarBase, 65);
  assert.deepEqual(
    normalized.keywords.presentes.map((item) => item.kw),
    ["Experiencia com SQL"],
  );
  assert.equal(normalized.ajustes_conteudo[0]?.coveragePercent, 50);
  assert.deepEqual(
    normalized.keywords.possiveis?.map((item) => item.kw),
    [],
  );
  assert.deepEqual(
    normalized.keywords.ausentes.map((item) => item.kw),
    ["Ingles avancado"],
  );
});

test("normalizeData preserves explicit keyword buckets for requirements_v2 payloads", () => {
  const normalized = normalizeData({
    analysisVersion: "requirements_v2",
    vaga: { cargo: "Analista", empresa: "EarlyCV" },
    fit: {
      score: 999,
      score_pos_ajustes: 999,
      categoria: "medio",
      headline: "headline",
      subheadline: "subheadline",
    },
    requirements: [
      {
        requirementKey: "sql",
        requirementText: "Experiencia com SQL e BI",
        importance: "high",
        gateLevel: "hard",
        coverageStatus: "covered",
        evidence: ["Projeto com SQL"],
        gapExplanation: "",
        recommendation: "",
      },
      {
        requirementKey: "python",
        requirementText: "Automacao com Python para dados",
        importance: "medium",
        coverageStatus: "partial",
        evidence: ["Scripts internos"],
        gapExplanation: "",
        recommendation: "",
      },
    ],
    scoring: {
      kind: "requirements_v2",
      sections: {
        experiencia: { score: 30, max: 50 },
        competencias: { score: 24, max: 40 },
        formatacao: { score: 9, max: 10 },
      },
      totals: {
        scoreAtualBase: 63,
        scoreAposLiberarBase: 71,
        scoreDelta: 8,
      },
    },
    positivos: [],
    ajustes_conteudo: [],
    ajustes_indisponiveis: [],
    keywords: {
      presentes: [{ kw: "SQL", pontos: 2 }],
      ausentes: [{ kw: "Python", pontos: 1 }],
    },
    formato_cv: {
      resumo: "ok",
      problemas: [],
      campos: [],
    },
    comparacao: { antes: "", depois: "" },
    pontos_fortes: [],
    lacunas: [],
    ats_keywords: {
      presentes: ["Experiencia com SQL e BI"],
      ausentes: ["Automacao com Python para dados"],
    },
    preview: { antes: "", depois: "" },
    projecao_melhoria: {
      score_atual: 0,
      score_pos_otimizacao: 0,
      explicacao_curta: "",
    },
    mensagem_venda: { titulo: "", subtexto: "" },
  });

  assert.deepEqual(
    normalized.keywords.presentes.map((item) => item.kw),
    ["SQL"],
  );
  assert.deepEqual(
    normalized.keywords.ausentes.map((item) => item.kw),
    ["Python"],
  );
  assert.equal(normalized.secoes.competencias.score, 24);
});
