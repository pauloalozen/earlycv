import type { CvAnalysisData } from "@/lib/cv-adaptation-api";

function applyBudget<T extends { pontos: number }>(
  items: T[],
  budget: number,
): T[] {
  if (items.length === 0) return items;
  const total = items.reduce((s, i) => s + i.pontos, 0);
  if (total === 0) {
    const even = Math.floor(budget / items.length);
    const rest = budget - even * items.length;
    return items.map((item, idx) => ({
      ...item,
      pontos: even + (idx === items.length - 1 ? rest : 0),
    }));
  }
  const scaled = items.map((item) => ({
    ...item,
    pontos: Math.max(1, Math.round((item.pontos / total) * budget)),
  }));
  const scaledTotal = scaled.reduce((s, i) => s + i.pontos, 0);
  const diff = budget - scaledTotal;
  if (diff !== 0) {
    scaled[scaled.length - 1] = {
      ...scaled[scaled.length - 1],
      pontos: Math.max(1, scaled[scaled.length - 1].pontos + diff),
    };
  }
  return scaled;
}

export function normalizeData(raw: CvAnalysisData) {
  const positivosRaw: Array<{ texto: string; pontos: number }> = raw.positivos
    ?.length
    ? raw.positivos
    : (raw.pontos_fortes ?? []).map((t, i) => ({
        texto: t,
        pontos: [12, 9, 8, 7, 5][i] ?? 5,
      }));

  const ajustesConteudoRaw: Array<{
    id: string;
    titulo: string;
    descricao: string;
    pontos: number;
    dica: string;
  }> = raw.ajustes_conteudo?.length
    ? raw.ajustes_conteudo.map((a, i) => ({ ...a, id: a.id ?? `a${i}` }))
    : (raw.lacunas ?? []).map((l, i) => ({
        id: `a${i}`,
        titulo: l,
        descricao: "",
        pontos: [11, 9, 7, 6, 5][i] ?? 5,
        dica: "",
      }));

  const kwPresentesRaw: Array<{ kw: string; pontos: number }> = raw.keywords
    ?.presentes?.length
    ? raw.keywords.presentes
    : (raw.ats_keywords?.presentes ?? []).map((kw) => ({ kw, pontos: 3 }));

  const kwAusentesRaw: Array<{ kw: string; pontos: number }> = raw.keywords
    ?.ausentes?.length
    ? raw.keywords.ausentes
    : (raw.ats_keywords?.ausentes ?? []).map((kw) => ({ kw, pontos: 4 }));

  const s1All = applyBudget([...positivosRaw, ...ajustesConteudoRaw], 40);
  const positivos = (s1All.slice(0, positivosRaw.length) as typeof positivosRaw)
    .slice()
    .sort((a, b) => b.pontos - a.pontos);
  const ajustesConteudo = (
    s1All.slice(positivosRaw.length) as typeof ajustesConteudoRaw
  )
    .slice()
    .sort((a, b) => b.pontos - a.pontos);

  const s2All = applyBudget([...kwPresentesRaw, ...kwAusentesRaw], 40);
  const kwPresentes = (
    s2All.slice(0, kwPresentesRaw.length) as typeof kwPresentesRaw
  )
    .slice()
    .sort((a, b) => b.pontos - a.pontos);
  const kwAusentes = (
    s2All.slice(kwPresentesRaw.length) as typeof kwAusentesRaw
  )
    .slice()
    .sort((a, b) => b.pontos - a.pontos);

  const scorePosAjustes =
    raw.fit.score_pos_ajustes ??
    raw.projecao_melhoria?.score_pos_otimizacao ??
    Math.min(raw.fit.score + 20, 95);

  const CAMPO_PTS: Record<string, number> = {
    "Nome completo": 2,
    "E-mail": 3,
    Telefone: 2,
    LinkedIn: 2,
    Localização: 1,
    "Resumo profissional": 3,
    "Formação acadêmica": 3,
    "Experiências com datas": 3,
    "Habilidades e Competências": 1,
  };

  const formatoCv = raw.formato_cv
    ? {
        ...raw.formato_cv,
        campos: Array.isArray(raw.formato_cv.campos)
          ? raw.formato_cv.campos
          : [],
        problemas: Array.isArray(raw.formato_cv.problemas)
          ? raw.formato_cv.problemas.toSorted(
              (a, b) =>
                a.impacto - b.impacto ||
                a.titulo.localeCompare(b.titulo, "pt-BR", {
                  sensitivity: "base",
                }),
            )
          : [],
      }
    : null;

  const formatacaoScore = (() => {
    if (!formatoCv) return 0;
    const problemasDeduction = formatoCv.problemas.reduce(
      (s, p) => s + (p.impacto < 0 ? p.impacto : 0),
      0,
    );
    const ptsFaltando = formatoCv.campos
      .filter((c) => !c.presente)
      .reduce((s, c) => s + (CAMPO_PTS[c.nome] ?? 1), 0);
    return Math.max(0, 20 + problemasDeduction - ptsFaltando);
  })();

  const secoes = {
    experiencia: {
      score: positivos.reduce((s, p) => s + p.pontos, 0),
      max: 40,
    },
    competencias: {
      score: kwPresentes.reduce((s, k) => s + k.pontos, 0),
      max: 40,
    },
    formatacao: { score: formatacaoScore, max: 20 },
  };

  return {
    vaga: raw.vaga,
    fit: { ...raw.fit, score_pos_ajustes: scorePosAjustes },
    positivos,
    ajustes_conteudo: ajustesConteudo,
    keywords: { presentes: kwPresentes, ausentes: kwAusentes },
    formato_cv: formatoCv,
    comparacao: raw.comparacao,
    preview: raw.preview ?? null,
    secoes,
  };
}
