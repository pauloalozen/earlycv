import type { CvAnalysisData } from "@/lib/cv-adaptation-api";

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

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

  const ajustesIndisponiveisRaw: Array<{
    id: string;
    titulo: string;
    descricao: string;
    pontos: number;
    dica: string;
  }> = Array.isArray((raw as CvAnalysisData & { ajustes_indisponiveis?: unknown }).ajustes_indisponiveis)
    ? ((raw as CvAnalysisData & {
        ajustes_indisponiveis: Array<{
          id?: string;
          titulo: string;
          descricao?: string;
          pontos: number;
          dica?: string;
        }>;
      }).ajustes_indisponiveis ?? []).map((a, i) => ({
        id: a.id ?? `i${i}`,
        titulo: a.titulo,
        descricao: a.descricao ?? "",
        pontos: a.pontos,
        dica: a.dica ?? "",
      }))
    : [];

  const kwPresentesRaw: Array<{ kw: string; pontos: number }> = raw.keywords
    ?.presentes?.length
    ? raw.keywords.presentes
    : (raw.ats_keywords?.presentes ?? []).map((kw) => ({ kw, pontos: 3 }));

  const kwAusentesRaw: Array<{ kw: string; pontos: number }> = raw.keywords
    ?.ausentes?.length
    ? raw.keywords.ausentes
    : (raw.ats_keywords?.ausentes ?? []).map((kw) => ({ kw, pontos: 4 }));

  const s1All = applyBudget(
    [...positivosRaw, ...ajustesConteudoRaw, ...ajustesIndisponiveisRaw],
    40,
  );
  const positivos = (s1All.slice(0, positivosRaw.length) as typeof positivosRaw)
    .slice()
    .sort((a, b) => b.pontos - a.pontos);
  const ajustesConteudo = (
    s1All.slice(
      positivosRaw.length,
      positivosRaw.length + ajustesConteudoRaw.length,
    ) as typeof ajustesConteudoRaw
  )
    .slice()
    .sort((a, b) => b.pontos - a.pontos);
  const ajustesIndisponiveis = (
    s1All.slice(
      positivosRaw.length + ajustesConteudoRaw.length,
    ) as typeof ajustesIndisponiveisRaw
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

  const CAMPO_PTS: Record<string, number> = {
    "Nome completo": 2,
    "E-mail": 2,
    Telefone: 2,
    "Localização": 2,
    Localizacao: 2,
    "Formação acadêmica": 2,
    "Formacao academica": 2,
    "Experiências com datas": 2,
    "Experiencias com datas": 2,
    LinkedIn: 1,
    "Resumo profissional": 1,
    "Habilidades e Competências": 1,
    "Habilidades e Competencias": 1,
  };

  const isCampoIndisponivel = (nome: string) => {
    const normalized = nome.trim().toLowerCase();
    return [
      "nome completo",
      "e-mail",
      "email",
      "telefone",
      "linkedin",
      "localização",
      "localizacao",
      "formação acadêmica",
      "formacao academica",
      "experiências com datas",
      "experiencias com datas",
    ].includes(normalized);
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

  const penalidadeProblema = (problema: {
    tipo: "critico" | "atencao" | "ok";
    impacto: number;
  }) => {
    if (problema.tipo === "ok") return 0;
    return Math.max(0, Math.abs(problema.impacto));
  };

  const penalidadesFormatacao = Math.max(
    0,
    formatoCv?.problemas.reduce((s, p) => s + penalidadeProblema(p), 0) ?? 0,
  );
  const penalidadesCamposAusentes =
    formatoCv?.campos
      .filter((c) => !c.presente)
      .reduce((s, c) => s + (CAMPO_PTS[c.nome] ?? 1), 0) ?? 0;
  const melhoriasFormatacaoSecao3 =
    formatoCv?.problemas.reduce((s, p) => s + penalidadeProblema(p), 0) ?? 0;
  const camposIndisponiveisSecao3 =
    formatoCv?.campos
      .filter((c) => !c.presente && isCampoIndisponivel(c.nome))
      .reduce((s, c) => s + (CAMPO_PTS[c.nome] ?? 1), 0) ?? 0;
  const totalSecao3Atual = clamp(
    20 - penalidadesFormatacao - penalidadesCamposAusentes,
    0,
    20,
  );

  const pontosFortesSecao1 = positivos.reduce((s, p) => s + p.pontos, 0);
  const ajustesConteudoSecao1 = ajustesConteudo.reduce((s, a) => s + a.pontos, 0);
  const ajustesIndisponiveisSecao1 = ajustesIndisponiveis.reduce(
    (s, a) => s + a.pontos,
    0,
  );
  const jaNoCvSecao2 = kwPresentes.reduce((s, k) => s + k.pontos, 0);
  const keywordsAusentesTotal = kwAusentes.reduce((s, k) => s + k.pontos, 0);

  const scoreAtualBase = clamp(
    pontosFortesSecao1 + jaNoCvSecao2 + totalSecao3Atual,
    0,
    100,
  );
  const pontosDisponiveisBase = clamp(
    ajustesConteudoSecao1 + melhoriasFormatacaoSecao3,
    0,
    100,
  );
  const scoreAposLiberarBase = clamp(
    scoreAtualBase + pontosDisponiveisBase,
    0,
    100,
  );

  const secoes = {
    experiencia: {
      score: pontosFortesSecao1,
      max: 40,
    },
    competencias: {
      score: jaNoCvSecao2,
      max: 40,
    },
    formatacao: { score: totalSecao3Atual, max: 20 },
  };

  return {
    vaga: raw.vaga,
    fit: { ...raw.fit },
    positivos,
    ajustes_conteudo: ajustesConteudo,
    ajustes_indisponiveis: ajustesIndisponiveis,
    keywords: { presentes: kwPresentes, ausentes: kwAusentes },
    formato_cv: formatoCv,
    comparacao: raw.comparacao,
    preview: raw.preview ?? null,
    secoes,
    score: {
      pontosFortesSecao1,
      ajustesConteudoSecao1,
      ajustesIndisponiveisSecao1,
      jaNoCvSecao2,
      keywordsAusentesTotal,
      penalidadesFormatacao,
      penalidadesCamposAusentes,
      melhoriasFormatacaoSecao3,
      camposIndisponiveisSecao3,
      totalSecao3Atual,
      scoreAtualBase,
      pontosDisponiveisBase,
      scoreAposLiberarBase,
    },
  };
}
