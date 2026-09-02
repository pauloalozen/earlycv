// Waterfall de prioridade do card "Próxima ação" do dashboard /meu-perfil.
// Cada estado documenta a condição-gatilho exata — ver proposta de design
// discutida com o Paulo (canvas "Meu Perfil — Redesign Dashboard"). A
// avaliação para no primeiro estado cuja condição for verdadeira; "default"
// nunca falha, então a função sempre retorna um HeroState.
export type HeroStateKind =
  | "interview_soon"
  | "cv_ready_unsent"
  | "credits_empty"
  | "high_match_recommendation"
  | "new_user"
  | "inactive"
  | "default";

export type HeroStateInput = {
  hasAnyApplication: boolean;
  nearestInterview: {
    id: string;
    jobTitle: string;
    companyName: string;
    nextActionAt: string;
  } | null;
  cvReadyUnsubmitted: {
    id: string;
    jobTitle: string;
    companyName: string;
  } | null;
  hasAvailableCredits: boolean;
  topRecommendation: {
    jobTitle: string;
    companyName: string;
    score: number;
  } | null;
  lastActivityAt: string | null;
  now?: Date;
};

export type HeroState = {
  kind: HeroStateKind;
  eyebrow: string;
  eyebrowQualifier: string;
  titlePlain: string;
  titleEmphasis: string;
  description: string;
  ctaLabel: string;
  ctaHref: string;
};

const INTERVIEW_SOON_DAYS = 3;
const INACTIVE_DAYS = 14;
const HIGH_MATCH_SCORE_THRESHOLD = 90;

function daysBetween(from: Date, to: Date): number {
  return (to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24);
}

export function resolveHeroState(input: HeroStateInput): HeroState {
  const now = input.now ?? new Date();

  // 1 · SE tem entrevista marcada nos próximos 3 dias
  if (input.nearestInterview) {
    const daysUntil = daysBetween(
      now,
      new Date(input.nearestInterview.nextActionAt),
    );
    if (daysUntil >= 0 && daysUntil <= INTERVIEW_SOON_DAYS) {
      const daysLabel =
        daysUntil < 1
          ? "hoje"
          : daysUntil < 2
            ? "amanhã"
            : `em ${Math.ceil(daysUntil)} dias`;
      return {
        kind: "interview_soon",
        eyebrow: "Próxima ação recomendada",
        eyebrowQualifier: "Entrevista em breve",
        titlePlain: "Sua entrevista com",
        titleEmphasis: `${input.nearestInterview.companyName} é ${daysLabel}.`,
        description: `${input.nearestInterview.jobTitle} — prepare-se com o EarlyCV.`,
        ctaLabel: "Preparar entrevista →",
        ctaHref: `/preparacao-para-entrevista?applicationId=${input.nearestInterview.id}`,
      };
    }
  }

  // 2 · SE tem candidatura com CV pronto mas não marcada como enviada
  if (input.cvReadyUnsubmitted) {
    return {
      kind: "cv_ready_unsent",
      eyebrow: "Próxima ação recomendada",
      eyebrowQualifier: "CV liberado",
      titlePlain: "Finalize sua candidatura",
      titleEmphasis: `pra ${input.cvReadyUnsubmitted.companyName}.`,
      description: `Seu CV pra ${input.cvReadyUnsubmitted.jobTitle} já está pronto — falta só enviar.`,
      ctaLabel: "Continuar candidatura →",
      ctaHref: `/candidaturas/${input.cvReadyUnsubmitted.id}`,
    };
  }

  // 3 · SE os créditos de download zeraram (bloqueia analisar/adaptar)
  if (!input.hasAvailableCredits) {
    return {
      kind: "credits_empty",
      eyebrow: "Próxima ação recomendada",
      eyebrowQualifier: "Créditos zerados",
      titlePlain: "Seus créditos",
      titleEmphasis: "acabaram.",
      description: "Compre mais créditos pra continuar adaptando seu CV.",
      ctaLabel: "Comprar créditos →",
      ctaHref: "/planos",
    };
  }

  // 4 · SE existe recomendação nova de altíssima aderência (Radar/Monitor)
  if (
    input.topRecommendation &&
    input.topRecommendation.score >= HIGH_MATCH_SCORE_THRESHOLD
  ) {
    return {
      kind: "high_match_recommendation",
      eyebrow: "Próxima ação recomendada",
      eyebrowQualifier: "Alta aderência encontrada",
      titlePlain: "Vaga muito aderente:",
      titleEmphasis: `${input.topRecommendation.jobTitle}.`,
      description: `${input.topRecommendation.companyName} — ${input.topRecommendation.score}% de match com seu perfil.`,
      ctaLabel: "Ver vaga →",
      ctaHref: "/alerta-vaga-certa",
    };
  }

  // 5 · SE o usuário é novo (zero candidaturas/análises)
  if (!input.hasAnyApplication) {
    return {
      kind: "new_user",
      eyebrow: "Próximo passo",
      eyebrowQualifier: "Primeiro acesso",
      titlePlain: "Comece sua",
      titleEmphasis: "primeira análise.",
      description:
        "Leva menos de 2 minutos e já mostra onde seu CV precisa melhorar.",
      ctaLabel: "Analisar meu CV →",
      ctaHref: "/adaptar",
    };
  }

  // 6 · SE está há 14+ dias sem nenhuma atividade
  if (input.lastActivityAt) {
    const daysSince = daysBetween(new Date(input.lastActivityAt), now);
    if (daysSince >= INACTIVE_DAYS) {
      return {
        kind: "inactive",
        eyebrow: "Que tal voltar?",
        eyebrowQualifier: "Sem atividade recente",
        titlePlain: "Faz um tempo que você",
        titleEmphasis: "não aparece por aqui.",
        description:
          "Suas candidaturas continuam salvas — bom momento pra revisar o que está em aberto.",
        ctaLabel: "Ver minhas candidaturas →",
        ctaHref: "/candidaturas",
      };
    }
  }

  // Fallback — nenhuma condição acima se aplicou
  return {
    kind: "default",
    eyebrow: "Próximo passo",
    eyebrowQualifier: "Sugestão",
    titlePlain: "Analisar",
    titleEmphasis: "nova vaga.",
    description: "Leva menos de 2 minutos",
    ctaLabel: "Adaptar meu CV →",
    ctaHref: "/adaptar",
  };
}
