const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

type PointsItem = { pontos: number };
type NamedField = { nome: string; presente: boolean };
type FormatProblem = {
  tipo: "critico" | "atencao" | "ok";
  titulo: string;
  descricao: string;
  impacto: number;
};
type CvAnalysisLike = {
  vaga: { cargo: string; empresa: string };
  fit: {
    score: number;
    score_pos_ajustes?: number;
    categoria: "baixo" | "medio" | "alto";
    headline: string;
    subheadline: string;
  };
  secoes?: {
    experiencia: { score: number; max: number };
    competencias: { score: number; max: number };
    formatacao: { score: number; max: number };
  };
  positivos?: Array<{ texto: string; pontos: number }>;
  ajustes_conteudo?: Array<{
    id?: string;
    titulo: string;
    descricao: string;
    pontos: number;
    dica: string;
  }>;
  ajustes_indisponiveis?: Array<{
    id?: string;
    titulo: string;
    descricao?: string;
    pontos: number;
    dica?: string;
  }>;
  keywords?: {
    presentes?: Array<{ kw: string; pontos: number }>;
    ausentes?: Array<{ kw: string; pontos: number }>;
  };
  formato_cv?: {
    ats_score?: number;
    resumo: string;
    problemas?: FormatProblem[];
    campos?: NamedField[];
  };
  comparacao: { antes: string; depois: string };
  pontos_fortes?: string[];
  lacunas?: string[];
  ats_keywords?: {
    presentes?: string[];
    ausentes?: string[];
  };
  preview?: { antes: string; depois: string } | null;
  projecao_melhoria: {
    score_atual: number;
    score_pos_otimizacao: number;
    explicacao_curta: string;
  };
  mensagem_venda: {
    titulo: string;
    subtexto: string;
  };
  adaptation_notes?: string;
};

function applyBudget<T extends PointsItem>(items: T[], budget: number): T[] {
  if (items.length === 0) return items;
  const total = items.reduce((sum, item) => sum + item.pontos, 0);
  if (total === 0) {
    const even = Math.floor(budget / items.length);
    const rest = budget - even * items.length;
    return items.map((item, index) => ({
      ...item,
      pontos: even + (index === items.length - 1 ? rest : 0),
    }));
  }

  const scaled = items.map((item) => ({
    ...item,
    pontos: Math.max(1, Math.round((item.pontos / total) * budget)),
  }));
  const diff = budget - scaled.reduce((sum, item) => sum + item.pontos, 0);

  if (diff !== 0) {
    scaled[scaled.length - 1] = {
      ...scaled[scaled.length - 1],
      pontos: Math.max(1, scaled[scaled.length - 1].pontos + diff),
    };
  }

  return scaled;
}

const CAMPO_PTS: Record<string, number> = {
  "Nome completo": 2,
  "E-mail": 2,
  Telefone: 2,
  Localização: 2,
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

function isCampoIndisponivel(nome: string): boolean {
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
}

function penalidadeProblema(problema: FormatProblem): number {
  if (problema.tipo === "ok") return 0;
  return Math.max(0, Math.abs(problema.impacto));
}

export function normalizeData<T extends CvAnalysisLike>(raw: T) {
  const positivosRaw = raw.positivos?.length
    ? raw.positivos
    : (raw.pontos_fortes ?? []).map((texto, index) => ({
        texto,
        pontos: [12, 9, 8, 7, 5][index] ?? 5,
      }));

  const ajustesConteudoRaw = raw.ajustes_conteudo?.length
    ? raw.ajustes_conteudo.map((item, index) => ({
        ...item,
        id: item.id ?? `a${index}`,
      }))
    : (raw.lacunas ?? []).map((titulo, index) => ({
        id: `a${index}`,
        titulo,
        descricao: "",
        pontos: [11, 9, 7, 6, 5][index] ?? 5,
        dica: "",
      }));

  const ajustesIndisponiveisRaw = Array.isArray(raw.ajustes_indisponiveis)
    ? raw.ajustes_indisponiveis.map((item, index) => ({
        id: item.id ?? `i${index}`,
        titulo: item.titulo,
        descricao: item.descricao ?? "",
        pontos: item.pontos,
        dica: item.dica ?? "",
      }))
    : [];

  const kwPresentesRaw = raw.keywords?.presentes?.length
    ? raw.keywords.presentes
    : (raw.ats_keywords?.presentes ?? []).map((kw) => ({ kw, pontos: 3 }));

  const kwAusentesRaw = raw.keywords?.ausentes?.length
    ? raw.keywords.ausentes
    : (raw.ats_keywords?.ausentes ?? []).map((kw) => ({ kw, pontos: 4 }));

  const s1All = applyBudget(
    [...positivosRaw, ...ajustesConteudoRaw, ...ajustesIndisponiveisRaw],
    40,
  );
  const positivos = (s1All.slice(0, positivosRaw.length) as typeof positivosRaw)
    .slice()
    .sort((a: PointsItem, b: PointsItem) => b.pontos - a.pontos);
  const ajustesConteudo = (
    s1All.slice(
      positivosRaw.length,
      positivosRaw.length + ajustesConteudoRaw.length,
    ) as typeof ajustesConteudoRaw
  )
    .slice()
    .sort((a: PointsItem, b: PointsItem) => b.pontos - a.pontos);
  const ajustesIndisponiveis = (
    s1All.slice(
      positivosRaw.length + ajustesConteudoRaw.length,
    ) as typeof ajustesIndisponiveisRaw
  )
    .slice()
    .sort((a: PointsItem, b: PointsItem) => b.pontos - a.pontos);

  const s2All = applyBudget([...kwPresentesRaw, ...kwAusentesRaw], 40);
  const kwPresentes = (
    s2All.slice(0, kwPresentesRaw.length) as typeof kwPresentesRaw
  )
    .slice()
    .sort((a: PointsItem, b: PointsItem) => b.pontos - a.pontos);
  const kwAusentes = (
    s2All.slice(kwPresentesRaw.length) as typeof kwAusentesRaw
  )
    .slice()
    .sort((a: PointsItem, b: PointsItem) => b.pontos - a.pontos);

  const formatoCv = raw.formato_cv
    ? {
        ...raw.formato_cv,
        campos: Array.isArray(raw.formato_cv.campos)
          ? raw.formato_cv.campos
          : [],
        problemas: Array.isArray(raw.formato_cv.problemas)
          ? raw.formato_cv.problemas.slice().sort((a, b) => {
              return (
                a.impacto - b.impacto ||
                a.titulo.localeCompare(b.titulo, "pt-BR", {
                  sensitivity: "base",
                })
              );
            })
          : [],
      }
    : null;

  const penalidadesFormatacao = Math.max(
    0,
    formatoCv?.problemas.reduce(
      (sum: number, problema: FormatProblem) =>
        sum + penalidadeProblema(problema),
      0,
    ) ?? 0,
  );
  const penalidadesCamposAusentes =
    formatoCv?.campos
      .filter((campo) => !campo.presente)
      .reduce((sum, campo) => sum + (CAMPO_PTS[campo.nome] ?? 1), 0) ?? 0;
  const melhoriasFormatacaoSecao3 =
    formatoCv?.problemas.reduce(
      (sum: number, problema: FormatProblem) =>
        sum + penalidadeProblema(problema),
      0,
    ) ?? 0;
  const camposIndisponiveisSecao3 =
    formatoCv?.campos
      .filter((campo) => !campo.presente && isCampoIndisponivel(campo.nome))
      .reduce((sum, campo) => sum + (CAMPO_PTS[campo.nome] ?? 1), 0) ?? 0;
  const totalSecao3Atual = clamp(
    20 - penalidadesFormatacao - penalidadesCamposAusentes,
    0,
    20,
  );

  const pontosFortesSecao1 = positivos.reduce(
    (sum: number, item: PointsItem) => sum + item.pontos,
    0,
  );
  const ajustesConteudoSecao1 = ajustesConteudo.reduce(
    (sum: number, item: PointsItem) => sum + item.pontos,
    0,
  );
  const ajustesIndisponiveisSecao1 = ajustesIndisponiveis.reduce(
    (sum: number, item: PointsItem) => sum + item.pontos,
    0,
  );
  const jaNoCvSecao2 = kwPresentes.reduce(
    (sum: number, item: PointsItem) => sum + item.pontos,
    0,
  );
  const keywordsAusentesTotal = kwAusentes.reduce(
    (sum: number, item: PointsItem) => sum + item.pontos,
    0,
  );

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
    secoes: {
      experiencia: { score: pontosFortesSecao1, max: 40 },
      competencias: { score: jaNoCvSecao2, max: 40 },
      formatacao: { score: totalSecao3Atual, max: 20 },
    },
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
