import { describe, expect, it } from "vitest";

import type { CvAnalysisData } from "@/lib/cv-adaptation-api";

import { normalizeData } from "./normalize-data";

describe("normalizeData", () => {
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
          { titulo: "Datas e instituições presentes", descricao: "", tipo: "ok", impacto: 0 },
          { titulo: "Resumo longo e pouco escaneável", descricao: "", tipo: "atencao", impacto: -4 },
          { titulo: "Formato compatível ATS", descricao: "", tipo: "ok", impacto: 0 },
          { titulo: "Objetivo genérico e pouco direcionado", descricao: "", tipo: "atencao", impacto: -4 },
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
