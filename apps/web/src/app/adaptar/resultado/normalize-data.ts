import type { CvAnalysisData } from "@/lib/cv-adaptation-api";

export function normalizeData(raw: CvAnalysisData) {
  const clamp = (value: number, min: number, max: number) =>
    Math.min(max, Math.max(min, value));

  const applyBudget = <T extends { pontos: number }>(
    items: T[],
    budget: number,
  ): T[] => {
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
  };

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

  const isCampoIndisponivel = (nome: string): boolean => {
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

  const penalidadeProblema = (problema: {
    tipo: "critico" | "atencao" | "ok";
    impacto: number;
  }): number => {
    if (problema.tipo === "ok") return 0;
    return Math.max(0, Math.abs(problema.impacto));
  };

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
  const positivos = s1All.slice(0, positivosRaw.length).sort((a, b) => {
    return b.pontos - a.pontos;
  });
  const ajustesConteudo = s1All
    .slice(positivosRaw.length, positivosRaw.length + ajustesConteudoRaw.length)
    .sort((a, b) => {
      return b.pontos - a.pontos;
    });
  const ajustesIndisponiveis = s1All
    .slice(positivosRaw.length + ajustesConteudoRaw.length)
    .sort((a, b) => {
      return b.pontos - a.pontos;
    });

  const s2All = applyBudget([...kwPresentesRaw, ...kwAusentesRaw], 40);
  const kwPresentes = s2All.slice(0, kwPresentesRaw.length).sort((a, b) => {
    return b.pontos - a.pontos;
  });
  const kwAusentes = s2All.slice(kwPresentesRaw.length).sort((a, b) => {
    return b.pontos - a.pontos;
  });

  const formatoCv = raw.formato_cv
    ? {
        ...raw.formato_cv,
        campos: Array.isArray(raw.formato_cv.campos)
          ? raw.formato_cv.campos
          : [],
        problemas: Array.isArray(raw.formato_cv.problemas)
          ? raw.formato_cv.problemas.slice().sort((a, b) => {
              return a.impacto - b.impacto || a.titulo.localeCompare(b.titulo);
            })
          : [],
      }
    : {
        ats_score: 100,
        resumo: "",
        problemas: [],
        campos: [],
      };

  const missingFieldsPenalty = formatoCv.campos
    .filter((c) => !c.presente && isCampoIndisponivel(c.nome))
    .reduce((sum, c) => sum + (CAMPO_PTS[c.nome] ?? 1), 0);

  const formatPenalty = formatoCv.problemas.reduce(
    (sum, problema) => sum + penalidadeProblema(problema),
    0,
  );

  const scoreExp = clamp(
    positivos.reduce((sum, item) => sum + item.pontos, 0),
    0,
    40,
  );
  const scoreComp = clamp(
    kwPresentes.reduce((sum, item) => sum + item.pontos, 0),
    0,
    40,
  );
  const scoreFmt = clamp(20 - missingFieldsPenalty - formatPenalty, 0, 20);
  const scoreAtualBase = clamp(scoreExp + scoreComp + scoreFmt, 0, 100);

  const scoreAposLiberarBase = clamp(
    scoreAtualBase +
      ajustesConteudo.reduce((sum, item) => sum + item.pontos, 0),
    0,
    100,
  );

  return {
    vaga: raw.vaga,
    fit: raw.fit,
    secoes:
      raw.secoes ?? {
        experiencia: { score: scoreExp, max: 40 },
        competencias: { score: scoreComp, max: 40 },
        formatacao: { score: scoreFmt, max: 20 },
      },
    positivos,
    keywords: {
      presentes: kwPresentes,
      ausentes: kwAusentes,
    },
    ajustes_conteudo: ajustesConteudo,
    ajustes_indisponiveis: ajustesIndisponiveis,
    formato_cv: formatoCv,
    preview: raw.preview ?? null,
    comparacao: raw.comparacao,
    pontos_fortes: raw.pontos_fortes ?? [],
    lacunas: raw.lacunas ?? [],
    ats_keywords: raw.ats_keywords ?? { presentes: [], ausentes: [] },
    mensagem_venda: raw.mensagem_venda,
    ajustes: {
      conteudo: ajustesConteudo,
      indisponiveis: ajustesIndisponiveis,
    },
    formato: formatoCv,
    score: {
      scoreAtualBase,
      scoreAposLiberarBase,
      experiencia: scoreExp,
      competencias: scoreComp,
      formatacao: scoreFmt,
    },
  };
}
