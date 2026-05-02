import { describe, expect, it } from "vitest";

import type { CvAnalysisData } from "@/lib/cv-adaptation-api";

import { normalizeData } from "./normalize-data";

describe("normalizeData", () => {
  it("computes base scores without depending on AI final scores", () => {
    const raw = {
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
          {
            tipo: "atencao",
            titulo: "Resumo longo",
            descricao: "",
            impacto: 4,
          },
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

    const normalized = normalizeData(raw);

    expect(normalized.score.ajustesIndisponiveisSecao1).toBe(10);
    expect(normalized.score.totalSecao3Atual).toBe(13);
    expect(normalized.score.melhoriasFormatacaoSecao3).toBe(4);
    expect(normalized.score.camposIndisponiveisSecao3).toBe(3);
    expect(normalized.score.scoreAtualBase).toBe(58);
    expect(normalized.score.pontosDisponiveisBase).toBe(14);
    expect(normalized.score.scoreAposLiberarBase).toBe(72);
  });

  it("keeps scoreAposLiberarBase clamped to 100", () => {
    const raw = {
      vaga: { cargo: "Analista", empresa: "EarlyCV" },
      fit: {
        score: 10,
        categoria: "alto",
        headline: "headline",
        subheadline: "subheadline",
      },
      positivos: [{ texto: "A", pontos: 39 }],
      ajustes_conteudo: [
        { id: "a1", titulo: "B", descricao: "", pontos: 1, dica: "" },
      ],
      ajustes_indisponiveis: [],
      keywords: {
        presentes: [{ kw: "SQL", pontos: 40 }],
        ausentes: [],
      },
      formato_cv: {
        resumo: "ok",
        problemas: [],
        campos: [{ nome: "Telefone", presente: true }],
      },
      comparacao: { antes: "", depois: "" },
      pontos_fortes: [],
      lacunas: [],
      melhorias_aplicadas: [],
      ats_keywords: { presentes: [], ausentes: [] },
      preview: { antes: "", depois: "" },
      projecao_melhoria: {
        score_atual: 12,
        score_pos_otimizacao: 14,
        explicacao_curta: "",
      },
      mensagem_venda: { titulo: "", subtexto: "" },
    } as unknown as CvAnalysisData;

    const normalized = normalizeData(raw);

    expect(normalized.score.totalSecao3Atual).toBe(20);
    expect(normalized.score.scoreAtualBase).toBe(99);
    expect(normalized.score.pontosDisponiveisBase).toBe(1);
    expect(normalized.score.scoreAposLiberarBase).toBe(100);
  });

  it("treats formatting penalties consistently even when impacto is negative", () => {
    const raw = {
      vaga: { cargo: "Analista", empresa: "EarlyCV" },
      fit: {
        score: 10,
        categoria: "medio",
        headline: "headline",
        subheadline: "subheadline",
      },
      positivos: [{ texto: "A", pontos: 40 }],
      ajustes_conteudo: [],
      ajustes_indisponiveis: [],
      keywords: {
        presentes: [{ kw: "SQL", pontos: 40 }],
        ausentes: [],
      },
      formato_cv: {
        resumo: "ok",
        problemas: [
          {
            tipo: "atencao",
            titulo: "Resumo longo",
            descricao: "",
            impacto: -4,
          },
          { tipo: "critico", titulo: "Tabela", descricao: "", impacto: -3 },
          { tipo: "ok", titulo: "Datas", descricao: "", impacto: 0 },
        ],
        campos: [],
      },
      comparacao: { antes: "", depois: "" },
      pontos_fortes: [],
      lacunas: [],
      melhorias_aplicadas: [],
      ats_keywords: { presentes: [], ausentes: [] },
      preview: { antes: "", depois: "" },
      projecao_melhoria: {
        score_atual: 12,
        score_pos_otimizacao: 14,
        explicacao_curta: "",
      },
      mensagem_venda: { titulo: "", subtexto: "" },
    } as unknown as CvAnalysisData;

    const normalized = normalizeData(raw);

    expect(normalized.score.penalidadesFormatacao).toBe(7);
    expect(normalized.score.melhoriasFormatacaoSecao3).toBe(7);
    expect(normalized.score.totalSecao3Atual).toBe(13);
  });

  it("keeps formato_cv safe when campos is missing", () => {
    const raw = {
      ats_keywords: { ausentes: [], presentes: [] },
      comparacao: { antes: "", depois: "" },
      fit: {
        categoria: "medio",
        headline: "headline",
        score: 70,
        subheadline: "subheadline",
      },
      formato_cv: {
        ats_score: 70,
        campos: undefined,
        problemas: [],
        resumo: "ok",
      },
      keywords: { ausentes: [], presentes: [] },
      lacunas: [],
      melhorias_aplicadas: [],
      mensagem_venda: { subtexto: "", titulo: "" },
      pontos_fortes: [],
      preview: { antes: "", depois: "" },
      projecao_melhoria: {
        explicacao_curta: "",
        score_atual: 70,
        score_pos_otimizacao: 78,
      },
      vaga: { cargo: "Analista", empresa: "EarlyCV" },
    } as unknown as CvAnalysisData;

    const normalized = normalizeData(raw);

    expect(normalized.formato_cv?.campos).toEqual([]);
  });

  it("sorts formato_cv problems by lowest impacto and then titulo", () => {
    const raw = {
      ats_keywords: { ausentes: [], presentes: [] },
      comparacao: { antes: "", depois: "" },
      fit: {
        categoria: "medio",
        headline: "headline",
        score: 70,
        subheadline: "subheadline",
      },
      formato_cv: {
        ats_score: 70,
        campos: [],
        problemas: [
          {
            titulo: "Datas e instituições presentes",
            descricao: "",
            tipo: "ok",
            impacto: 0,
          },
          {
            titulo: "Resumo longo e pouco escaneável",
            descricao: "",
            tipo: "atencao",
            impacto: -4,
          },
          {
            titulo: "Formato compatível ATS",
            descricao: "",
            tipo: "ok",
            impacto: 0,
          },
          {
            titulo: "Objetivo genérico e pouco direcionado",
            descricao: "",
            tipo: "atencao",
            impacto: -4,
          },
        ],
        resumo: "ok",
      },
      keywords: { ausentes: [], presentes: [] },
      lacunas: [],
      melhorias_aplicadas: [],
      mensagem_venda: { subtexto: "", titulo: "" },
      pontos_fortes: [],
      preview: { antes: "", depois: "" },
      projecao_melhoria: {
        explicacao_curta: "",
        score_atual: 70,
        score_pos_otimizacao: 78,
      },
      vaga: { cargo: "Analista", empresa: "EarlyCV" },
    } as unknown as CvAnalysisData;

    const normalized = normalizeData(raw);

    expect(normalized.formato_cv?.problemas.map((p) => p.titulo)).toEqual([
      "Objetivo genérico e pouco direcionado",
      "Resumo longo e pouco escaneável",
      "Datas e instituições presentes",
      "Formato compatível ATS",
    ]);
  });
});
