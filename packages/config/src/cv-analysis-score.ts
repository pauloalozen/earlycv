import { normalizeData } from "./cv-analysis-normalize.js";

type ResolveCvAnalysisScoresOptions = {
  selectedMissingKeywords?: string[];
};

type ResolveCvAnalysisScoresResult = {
  scoreBefore: number | null;
  scoreAfter: number | null;
  selectedMissingKeywords: string[];
};

function parseTextArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter(
        (item): item is string =>
          typeof item === "string" && item.trim().length > 0,
      )
    : [];
}

function parseNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function canResolveNormalizedHistoricalPayload(
  parsed: Record<string, unknown>,
): boolean {
  if (!parsed.fit || typeof parsed.fit !== "object") return false;

  return (
    Array.isArray(parsed.positivos) ||
    Array.isArray(parsed.ajustes_conteudo) ||
    Array.isArray(parsed.ajustes_indisponiveis) ||
    Array.isArray(parsed.pontos_fortes) ||
    Array.isArray(parsed.lacunas) ||
    Boolean(parsed.keywords && typeof parsed.keywords === "object") ||
    Boolean(parsed.formato_cv && typeof parsed.formato_cv === "object") ||
    Boolean(parsed.ats_keywords && typeof parsed.ats_keywords === "object")
  );
}

export function resolveCvAnalysisScores(
  adaptedContentJson: unknown,
  options: ResolveCvAnalysisScoresOptions = {},
): ResolveCvAnalysisScoresResult {
  const parsed =
    adaptedContentJson && typeof adaptedContentJson === "object"
      ? (adaptedContentJson as Record<string, unknown>)
      : null;

  if (!parsed) {
    return {
      scoreBefore: null,
      scoreAfter: null,
      selectedMissingKeywords: [],
    };
  }

  const payloadSelectedMissingKeywords = parseTextArray(
    parsed.selectedMissingKeywords,
  );
  const selectedMissingKeywords =
    options.selectedMissingKeywords &&
    options.selectedMissingKeywords.length > 0
      ? parseTextArray(options.selectedMissingKeywords).map((keyword) =>
          keyword.trim(),
        )
      : payloadSelectedMissingKeywords;

  if (canResolveNormalizedHistoricalPayload(parsed)) {
    try {
      const normalized = normalizeData(parsed as never);
      const ptsKwSelecionadas = normalized.keywords.ausentes
        .filter((k) => selectedMissingKeywords.includes(k.kw))
        .reduce((s, k) => s + k.pontos, 0);
      const ptsAjustes =
        normalized.score.ajustesConteudoSecao1 +
        normalized.score.keywordsPossiveisTotal;
      const scoreAfter = Math.min(
        100,
        normalized.score.scoreAtualBase + ptsAjustes + ptsKwSelecionadas,
      );
      return {
        scoreBefore: normalized.score.scoreAtualBase,
        scoreAfter,
        selectedMissingKeywords,
      };
    } catch {
      // Preserve scalar fallbacks for malformed historical payloads.
    }
  }

  const fit =
    parsed.fit && typeof parsed.fit === "object"
      ? (parsed.fit as Record<string, unknown>)
      : null;
  const projection =
    parsed.projecao_melhoria && typeof parsed.projecao_melhoria === "object"
      ? (parsed.projecao_melhoria as Record<string, unknown>)
      : null;
  const atsScore =
    parsed.atsScore && typeof parsed.atsScore === "object"
      ? (parsed.atsScore as Record<string, unknown>)
      : null;

  return {
    scoreBefore:
      parseNumber(parsed.scoreBefore) ??
      parseNumber(projection?.score_atual) ??
      null,
    scoreAfter:
      parseNumber(parsed.scoreAfter) ??
      parseNumber(parsed.score_pos_ajustes) ??
      parseNumber(atsScore?.after) ??
      parseNumber(fit?.score_pos_ajustes) ??
      parseNumber(projection?.score_pos_otimizacao) ??
      parseNumber(projection?.score_pos_ajustes) ??
      parseNumber(projection?.scoreAfter) ??
      parseNumber(fit?.score) ??
      null,
    selectedMissingKeywords,
  };
}
