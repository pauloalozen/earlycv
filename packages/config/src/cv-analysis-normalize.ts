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
  analysisVersion?: "legacy_v1" | "requirements_v2";
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
  positivos?: Array<{
    texto: string;
    pontos: number;
    coveragePercent?: 0 | 25 | 50 | 75 | 100;
  }>;
  ajustes_conteudo?: Array<{
    id?: string;
    titulo: string;
    descricao: string;
    pontos: number;
    dica: string;
    coveragePercent?: 0 | 25 | 50 | 75 | 100;
  }>;
  ajustes_indisponiveis?: Array<{
    id?: string;
    titulo: string;
    descricao?: string;
    pontos: number;
    dica?: string;
    coveragePercent?: 0 | 25 | 50 | 75 | 100;
  }>;
  keywords?: {
    presentes?: Array<{ kw: string; pontos: number }>;
    possiveis?: Array<{ kw: string; pontos: number }>;
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
  sinais_referencia?: string[];
  requirements?: Array<{
    requirementKey?: string;
    requirementText: string;
    importance: "high" | "medium" | "low";
    gateLevel?: "hard" | "soft";
    coverageStatus: "covered" | "partial" | "missing";
    coveragePercent?: 0 | 25 | 50 | 75 | 100;
    evidence?: string[];
    gapExplanation?: string;
    recommendation?: string;
    impactScore?: number;
  }>;
  scoring?: {
    kind: "requirements_v2";
    sections: {
      experiencia: { score: number; max: number };
      competencias: { score: number; max: number };
      formatacao: { score: number; max: number };
    };
    totals: {
      scoreAtualBase: number;
      scoreAposLiberarBase: number;
      scoreDelta: number;
    };
  };
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

function getRequirementWeight(requirement: {
  importance: "high" | "medium" | "low";
  gateLevel?: "hard" | "soft";
}): number {
  const base =
    requirement.importance === "high"
      ? 5
      : requirement.importance === "medium"
        ? 3
        : 1;
  return requirement.gateLevel === "hard" ? base + 1 : base;
}

function deriveCoveragePercent(requirement: {
  coverageStatus: "covered" | "partial" | "missing";
  evidence?: string[];
  impactScore?: number;
  coveragePercent?: 0 | 25 | 50 | 75 | 100;
}): 0 | 25 | 50 | 75 | 100 {
  if (requirement.coveragePercent !== undefined) {
    return requirement.coveragePercent;
  }

  const evidenceCount = Array.isArray(requirement.evidence)
    ? requirement.evidence.length
    : 0;
  const impactScore = requirement.impactScore ?? 0;

  if (requirement.coverageStatus === "covered") return 100;
  if (requirement.coverageStatus === "partial") {
    if (evidenceCount >= 2 || impactScore >= 80) return 75;
    if (evidenceCount >= 1 || impactScore >= 40) return 50;
    return 25;
  }

  if (evidenceCount > 0 || impactScore >= 25) return 25;
  return 0;
}

function deriveProjectedCoveragePercent(
  coveragePercent: 0 | 25 | 50 | 75 | 100,
): 0 | 25 | 50 | 75 | 100 {
  if (coveragePercent === 100 || coveragePercent === 0) {
    return coveragePercent;
  }

  if (coveragePercent >= 50) {
    return 100;
  }

  return 75;
}

function deriveVersionedRequirementBuckets(raw: CvAnalysisLike): null | {
  positivosRaw: Array<{
    texto: string;
    pontos: number;
    coveragePercent: 0 | 25 | 50 | 75 | 100;
  }>;
  ajustesConteudoRaw: Array<{
    id?: string;
    titulo: string;
    descricao: string;
    pontos: number;
    dica: string;
    coveragePercent: 0 | 25 | 50 | 75 | 100;
  }>;
  ajustesIndisponiveisRaw: Array<{
    id?: string;
    titulo: string;
    descricao?: string;
    pontos: number;
    dica?: string;
    coveragePercent: 0 | 25 | 50 | 75 | 100;
  }>;
  kwPresentesRaw: Array<{ kw: string; pontos: number }>;
  kwPossiveisRaw: Array<{ kw: string; pontos: number }>;
  kwAusentesRaw: Array<{ kw: string; pontos: number }>;
  section1Override: number;
  section2Override: number;
} {
  if (raw.analysisVersion !== "requirements_v2" || !raw.requirements?.length) {
    return null;
  }

  const weighted = raw.requirements.map((requirement) => {
    const weight = getRequirementWeight(requirement);
    const evidence = Array.isArray(requirement.evidence)
      ? requirement.evidence.filter((item) => typeof item === "string")
      : [];
    const coveragePercent = deriveCoveragePercent({
      ...requirement,
      evidence,
    });
    const projectedCoveragePercent =
      deriveProjectedCoveragePercent(coveragePercent);
    const isCovered = requirement.coverageStatus === "covered";
    const isAdjustable =
      requirement.coverageStatus === "partial" ||
      (requirement.coverageStatus === "missing" && evidence.length > 0);
    const isUnavailable =
      requirement.coverageStatus === "missing" && evidence.length === 0;
    const currentContribution = weight * (coveragePercent / 100);
    const projectedContribution = weight * (projectedCoveragePercent / 100);
    const upgradeContribution = Math.max(
      0,
      projectedContribution - currentContribution,
    );
    const lockedContribution = Math.max(0, weight - projectedContribution);
    return {
      ...requirement,
      evidence,
      weight,
      coveragePercent,
      projectedCoveragePercent,
      isCovered,
      isAdjustable,
      isUnavailable,
      currentContribution,
      upgradeContribution,
      lockedContribution,
    };
  });

  const totalWeight = weighted.reduce((sum, item) => sum + item.weight, 0);
  const coveredItems = weighted.filter((item) => item.isCovered);
  const adjustableItems = weighted.filter((item) => item.isAdjustable);
  const unavailableItems = weighted.filter((item) => item.isUnavailable);
  const coveredWeight = coveredItems.reduce(
    (sum, item) => sum + item.currentContribution,
    0,
  );
  const adjustableWeight = adjustableItems.reduce(
    (sum, item) => sum + item.upgradeContribution,
    0,
  );
  const section1Override =
    totalWeight > 0 ? Math.round((coveredWeight / totalWeight) * 50) : 0;
  const explicitKeywordScore = (raw.keywords?.presentes ?? []).reduce(
    (sum, item) => sum + (Number.isFinite(item.pontos) ? item.pontos : 0),
    0,
  );
  const section2Override =
    raw.scoring?.kind === "requirements_v2"
      ? raw.scoring.sections.competencias.score
      : explicitKeywordScore > 0
        ? clamp(explicitKeywordScore, 0, 40)
        : totalWeight > 0
          ? Math.round((coveredWeight / totalWeight) * 40)
          : 0;
  const adjustmentBudget =
    totalWeight > 0
      ? Math.round((adjustableWeight / totalWeight) * 50)
      : 0;
  const unavailableBudget = clamp(
    totalWeight > 0
      ? Math.round(
          (weighted.reduce((sum, item) => sum + item.lockedContribution, 0) /
            totalWeight) *
            50,
        )
      : 0,
    0,
    50,
  );

  return {
    positivosRaw: applyBudget(
      coveredItems
        .slice()
        .sort(
          (a, b) =>
            b.coveragePercent - a.coveragePercent ||
            b.currentContribution - a.currentContribution,
        )
        .map((item) => ({
          texto: item.requirementText,
          pontos: Math.max(1, Math.round(item.currentContribution * 4)),
          coveragePercent: item.coveragePercent,
        })),
      clamp(
        totalWeight > 0 ? Math.round((coveredWeight / totalWeight) * 50) : 0,
        0,
        section1Override,
      ),
    ),
    ajustesConteudoRaw: applyBudget(
      adjustableItems
        .slice()
        .sort(
          (a, b) =>
            b.coveragePercent - a.coveragePercent ||
            b.upgradeContribution - a.upgradeContribution,
        )
        .map((item, index) => ({
          id: item.requirementKey || `a${index}`,
          titulo: item.requirementText,
          descricao:
            item.gapExplanation ||
            item.recommendation ||
            "Cobertura parcial do requisito.",
          pontos: Math.max(1, Math.round(item.upgradeContribution * 4)),
          dica:
            item.recommendation ||
            "Evidencie esse requisito apenas se for verdadeiro no CV.",
          coveragePercent: item.coveragePercent,
        })),
      adjustmentBudget,
    ),
    ajustesIndisponiveisRaw: applyBudget(
      unavailableItems
        .slice()
        .sort((a, b) => b.lockedContribution - a.lockedContribution)
        .map((item, index) => ({
          id: item.requirementKey || `i${index}`,
          titulo: item.requirementText,
          descricao:
            item.gapExplanation || "Nao ha evidencia suficiente no CV atual.",
          pontos: Math.max(1, Math.round(item.lockedContribution * 4)),
          dica:
            item.recommendation ||
            "Nao e possivel afirmar esse requisito sem inventar informacao.",
          coveragePercent: item.coveragePercent,
        })),
      unavailableBudget,
    ),
    kwPresentesRaw: applyBudget(
      coveredItems.map((item) => ({
        kw: item.requirementText,
        pontos: item.weight,
      })),
      section2Override,
    ),
    kwPossiveisRaw: [],
    kwAusentesRaw: applyBudget(
      weighted
        .filter((item) => item.isUnavailable)
        .map((item) => ({
          kw: item.requirementText,
          pontos: item.weight,
        })),
      clamp(40 - section2Override, 0, 40),
    ),
    section1Override,
    section2Override,
  };
}

function resolveVersionedKeywordBuckets(
  raw: CvAnalysisLike,
  versioned: ReturnType<typeof deriveVersionedRequirementBuckets>,
) {
  if (raw.analysisVersion !== "requirements_v2") {
    return null;
  }

  const hasExplicitKeywords =
    !!raw.keywords?.presentes?.length ||
    !!raw.keywords?.possiveis?.length ||
    !!raw.keywords?.ausentes?.length;
  if (hasExplicitKeywords) {
    return {
      kwPresentesRaw: raw.keywords?.presentes ?? [],
      kwPossiveisRaw: raw.keywords?.possiveis ?? [],
      kwAusentesRaw: raw.keywords?.ausentes ?? [],
    };
  }

  const hasLegacyAtsKeywords =
    !!raw.ats_keywords?.presentes?.length ||
    !!raw.ats_keywords?.ausentes?.length;
  if (hasLegacyAtsKeywords) {
    return {
      kwPresentesRaw: (raw.ats_keywords?.presentes ?? []).map((kw) => ({
        kw,
        pontos: 3,
      })),
      kwPossiveisRaw: [],
      kwAusentesRaw: (raw.ats_keywords?.ausentes ?? []).map((kw) => ({
        kw,
        pontos: 4,
      })),
    };
  }

  return versioned
    ? {
        kwPresentesRaw: versioned.kwPresentesRaw,
        kwPossiveisRaw: versioned.kwPossiveisRaw,
        kwAusentesRaw: versioned.kwAusentesRaw,
      }
    : null;
}

export function normalizeData<T extends CvAnalysisLike>(raw: T) {
  const versioned = deriveVersionedRequirementBuckets(raw);
  const versionedKeywords = resolveVersionedKeywordBuckets(raw, versioned);
  const section1Budget = raw.scoring?.kind === "requirements_v2" ? 50 : 40;

  const positivosRaw =
    versioned?.positivosRaw ??
    (raw.positivos?.length
      ? raw.positivos
      : (raw.pontos_fortes ?? []).map((texto, index) => ({
          texto,
          pontos: [12, 9, 8, 7, 5][index] ?? 5,
        })));

  const ajustesConteudoRaw =
    versioned?.ajustesConteudoRaw ??
    (raw.ajustes_conteudo?.length
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
        })));

  const ajustesIndisponiveisRaw =
    versioned?.ajustesIndisponiveisRaw ??
    (Array.isArray(raw.ajustes_indisponiveis)
      ? raw.ajustes_indisponiveis.map((item, index) => ({
          id: item.id ?? `i${index}`,
          titulo: item.titulo,
          descricao: item.descricao ?? "",
          pontos: item.pontos,
          dica: item.dica ?? "",
        }))
      : []);

  const kwPresentesRaw =
    versionedKeywords?.kwPresentesRaw ??
    (raw.keywords?.presentes?.length
      ? raw.keywords.presentes
      : (raw.ats_keywords?.presentes ?? []).map((kw) => ({ kw, pontos: 3 })));
  const kwPossiveisRaw =
    versionedKeywords?.kwPossiveisRaw ?? raw.keywords?.possiveis ?? [];

  const kwAusentesRaw =
    versionedKeywords?.kwAusentesRaw ??
    (raw.keywords?.ausentes?.length
      ? raw.keywords.ausentes
      : (raw.ats_keywords?.ausentes ?? []).map((kw) => ({ kw, pontos: 4 })));

  const positivos = (
    versioned
      ? positivosRaw
      : (applyBudget(
          [...positivosRaw, ...ajustesConteudoRaw, ...ajustesIndisponiveisRaw],
          section1Budget,
        ).slice(0, positivosRaw.length) as typeof positivosRaw)
  )
    .slice()
    .sort((a: PointsItem, b: PointsItem) => b.pontos - a.pontos);
  const ajustesConteudo = (
    versioned
      ? ajustesConteudoRaw
      : (applyBudget(
          [...positivosRaw, ...ajustesConteudoRaw, ...ajustesIndisponiveisRaw],
          section1Budget,
        ).slice(
          positivosRaw.length,
          positivosRaw.length + ajustesConteudoRaw.length,
        ) as typeof ajustesConteudoRaw)
  )
    .slice()
    .sort((a: PointsItem, b: PointsItem) => b.pontos - a.pontos);
  const ajustesIndisponiveis = (
    versioned
      ? ajustesIndisponiveisRaw
      : (applyBudget(
          [...positivosRaw, ...ajustesConteudoRaw, ...ajustesIndisponiveisRaw],
          section1Budget,
        ).slice(
          positivosRaw.length + ajustesConteudoRaw.length,
        ) as typeof ajustesIndisponiveisRaw)
  )
    .slice()
    .sort((a: PointsItem, b: PointsItem) => b.pontos - a.pontos);

  const s2All = versioned
    ? [...kwPresentesRaw, ...kwPossiveisRaw, ...kwAusentesRaw]
    : applyBudget([...kwPresentesRaw, ...kwPossiveisRaw, ...kwAusentesRaw], 40);
  const kwPresentes = (
    s2All.slice(0, kwPresentesRaw.length) as typeof kwPresentesRaw
  )
    .slice()
    .sort((a: PointsItem, b: PointsItem) => b.pontos - a.pontos);
  const kwPossiveis = (
    s2All.slice(
      kwPresentesRaw.length,
      kwPresentesRaw.length + kwPossiveisRaw.length,
    ) as typeof kwPossiveisRaw
  )
    .slice()
    .sort((a: PointsItem, b: PointsItem) => b.pontos - a.pontos);
  const kwAusentes = (
    s2All.slice(
      kwPresentesRaw.length + kwPossiveisRaw.length,
    ) as typeof kwAusentesRaw
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

  const penalidadesFormatacao =
    raw.analysisVersion === "requirements_v2"
      ? 0
      : Math.max(
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
      .reduce(
        (sum, campo) =>
          sum +
          (raw.analysisVersion === "requirements_v2"
            ? 1
            : (CAMPO_PTS[campo.nome] ?? 1)),
        0,
      ) ?? 0;
  const melhoriasFormatacaoSecao3 =
    raw.analysisVersion === "requirements_v2"
      ? 0
      : (formatoCv?.problemas.reduce(
          (sum: number, problema: FormatProblem) =>
            sum + penalidadeProblema(problema),
          0,
        ) ?? 0);
  const camposIndisponiveisSecao3 =
    formatoCv?.campos
      .filter((campo) => !campo.presente && isCampoIndisponivel(campo.nome))
      .reduce(
        (sum, campo) =>
          sum +
          (raw.analysisVersion === "requirements_v2"
            ? 1
            : (CAMPO_PTS[campo.nome] ?? 1)),
        0,
      ) ?? 0;
  const totalSecao3Atual =
    raw.scoring?.kind === "requirements_v2"
      ? raw.scoring.sections.formatacao.score
      : clamp(20 - penalidadesFormatacao - penalidadesCamposAusentes, 0, 20);

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
  const keywordsPossiveisTotal = kwPossiveis.reduce(
    (sum: number, item: PointsItem) => sum + item.pontos,
    0,
  );
  const keywordsAusentesTotal = kwAusentes.reduce(
    (sum: number, item: PointsItem) => sum + item.pontos,
    0,
  );

  const pontosFortesSecao1Resolved =
    versioned?.section1Override ?? pontosFortesSecao1;
  const jaNoCvSecao2Resolved = versioned?.section2Override ?? jaNoCvSecao2;
  const scoreAtualBase = clamp(
    pontosFortesSecao1Resolved + jaNoCvSecao2Resolved + totalSecao3Atual,
    0,
    100,
  );
  const pontosDisponiveisBase = clamp(
    ajustesConteudoSecao1 +
      keywordsPossiveisTotal +
      keywordsAusentesTotal +
      melhoriasFormatacaoSecao3,
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
    keywords: {
      presentes: kwPresentes,
      possiveis: kwPossiveis,
      ausentes: kwAusentes,
    },
    formato_cv: formatoCv,
    comparacao: raw.comparacao,
    preview: raw.preview ?? null,
    sinais_referencia: Array.isArray(raw.sinais_referencia)
      ? raw.sinais_referencia
      : [],
    secoes: {
      experiencia: {
        score: pontosFortesSecao1Resolved,
        max: raw.scoring?.kind === "requirements_v2" ? 50 : 40,
      },
      competencias: { score: jaNoCvSecao2Resolved, max: 40 },
      formatacao: {
        score: totalSecao3Atual,
        max: raw.scoring?.kind === "requirements_v2" ? 10 : 20,
      },
    },
    score: {
      pontosFortesSecao1: pontosFortesSecao1Resolved,
      ajustesConteudoSecao1,
      ajustesIndisponiveisSecao1,
      jaNoCvSecao2: jaNoCvSecao2Resolved,
      keywordsPossiveisTotal,
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
