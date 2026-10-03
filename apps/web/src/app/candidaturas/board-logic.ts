import type {
  JobApplicationDto,
  JobApplicationStatus,
} from "@/lib/job-applications-api";

// Etapas do quadro (kanban) de /candidaturas, da esquerda pra direita. A
// lista de arquivadas usa os mesmos grupos.
//
// São 4 etapas da candidatura em si. Analisar a vaga e liberar o CV são
// ações DENTRO de "Salva" (antes de se candidatar) — os status ANALYZED e
// CV_READY continuam existindo e aparecem como badge no card, não como
// coluna.
export const BOARD_COLUMNS: {
  key: string;
  label: string;
  step: number;
  statuses: JobApplicationStatus[];
  accent: string;
  headerBg: string;
  scoreColor: string | null;
  dark: boolean;
}[] = [
  {
    key: "saved",
    step: 1,
    label: "Salva",
    statuses: ["SAVED", "ANALYZED", "CV_READY"],
    accent: "#c0beb4",
    headerBg: "rgba(192,190,180,0.10)",
    scoreColor: "#2a6a10",
    dark: false,
  },
  {
    key: "applied",
    step: 2,
    label: "Candidatado",
    statuses: ["APPLIED"],
    accent: "#1a1a18",
    headerBg: "rgba(10,10,10,0.055)",
    scoreColor: "#2a6a10",
    dark: true,
  },
  {
    key: "interview",
    step: 3,
    label: "Em entrevista",
    statuses: ["INTERVIEW", "IN_PROCESS", "ASSESSMENT", "OFFER"],
    accent: "#c8a000",
    headerBg: "rgba(200,160,0,0.09)",
    scoreColor: "#7a5a00",
    dark: false,
  },
  {
    key: "closed",
    step: 4,
    label: "Finalizado",
    statuses: ["HIRED", "REJECTED", "WITHDRAWN"],
    accent: "#a8a6a0",
    headerBg: "rgba(168,166,160,0.08)",
    scoreColor: "#2a6a10",
    dark: false,
  },
];

export type BoardColumnKey = "saved" | "applied" | "interview" | "closed";

// Etapa em que a candidatura aparece, a partir do status.
export function columnForStatus(status: JobApplicationStatus): BoardColumnKey {
  const column = BOARD_COLUMNS.find((c) => c.statuses.includes(status));
  return (column?.key ?? "saved") as BoardColumnKey;
}

type ProgressFields = Pick<
  JobApplicationDto,
  | "bestCvState"
  | "cvAdaptations"
  | "currentCvAdaptationId"
  | "bestScore"
  | "scoreAfter"
  | "scoreBefore"
>;

// Status ao voltar pra "Salva": nunca apaga o progresso de antes da
// candidatura. CV liberado → CV_READY; analisada → ANALYZED; senão SAVED.
// Algum CV desta candidatura já foi liberado (pago com crédito). Também é a
// trava de exclusão: candidatura com CV liberado nunca pode ser excluída.
export function hasUnlockedCv(
  application: Pick<JobApplicationDto, "bestCvState" | "cvAdaptations">,
) {
  return (
    application.bestCvState === "unlocked" ||
    application.bestCvState === "ready" ||
    (application.cvAdaptations?.some(
      (adaptation) =>
        adaptation.isUnlocked || adaptation.status === "delivered",
    ) ??
      false)
  );
}

export function preApplicationStatus(
  application: ProgressFields,
): JobApplicationStatus {
  if (hasUnlockedCv(application)) return "CV_READY";
  const analyzed =
    application.currentCvAdaptationId !== null ||
    (application.cvAdaptations?.length ?? 0) > 0 ||
    application.bestScore !== null ||
    application.scoreAfter !== null ||
    application.scoreBefore !== null;
  return analyzed ? "ANALYZED" : "SAVED";
}

// Status gravado ao soltar numa etapa vinda de outra. "closed" agrupa 3
// desfechos (Contratado/Recusado/Desistência): o usuário escolhe — null.
// "interview" agrupa INTERVIEW/IN_PROCESS/ASSESSMENT/OFFER: entra como
// INTERVIEW. "saved" depende do progresso (preApplicationStatus).
export function statusForColumn(
  key: BoardColumnKey,
  application: ProgressFields,
): JobApplicationStatus | null {
  switch (key) {
    case "saved":
      return preApplicationStatus(application);
    case "applied":
      return "APPLIED";
    case "interview":
      return "INTERVIEW";
    case "closed":
      return null;
  }
}

// Ordem dentro da etapa: a manual (boardPosition) primeiro; o que nunca foi
// reordenado vem depois, pela última atualização (ordem de antes do quadro).
export function compareBoardOrder(
  a: Pick<JobApplicationDto, "boardPosition" | "updatedAt">,
  b: Pick<JobApplicationDto, "boardPosition" | "updatedAt">,
) {
  const pa = a.boardPosition ?? null;
  const pb = b.boardPosition ?? null;
  if (pa !== null && pb !== null && pa !== pb) return pa - pb;
  if (pa !== null && pb === null) return -1;
  if (pa === null && pb !== null) return 1;
  return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
}

export type BoardColumns = Record<BoardColumnKey, string[]>;

export function buildBoardColumns(
  applications: JobApplicationDto[],
): BoardColumns {
  const columns: BoardColumns = {
    saved: [],
    applied: [],
    interview: [],
    closed: [],
  };
  const sorted = [...applications].sort(compareBoardOrder);
  for (const application of sorted) {
    columns[columnForStatus(application.status)].push(application.id);
  }
  return columns;
}

// Filtros rápidos de /candidaturas (quadro e arquivadas). Marcar mais de um
// mostra o que bate com QUALQUER deles: "CV analisado" e "CV liberado" são
// status excludentes, então exigir todos daria sempre vazio.
export type QuickFilterKey =
  | "cv_analyzed"
  | "cv_released"
  | "cv_adapted"
  | "job_closed";

export const QUICK_FILTERS: Array<{
  key: QuickFilterKey;
  label: string;
  matches: (application: JobApplicationDto) => boolean;
}> = [
  {
    key: "cv_analyzed",
    label: "CV analisado",
    matches: (application) => application.status === "ANALYZED",
  },
  {
    key: "cv_released",
    label: "CV liberado",
    matches: (application) => application.status === "CV_READY",
  },
  {
    key: "cv_adapted",
    label: "CV adaptado",
    matches: (application) => application.bestCvState === "ready",
  },
  {
    key: "job_closed",
    label: "Vaga encerrada",
    matches: (application) => application.jobClosed === true,
  },
];

export function matchesBoardFilters(
  application: JobApplicationDto,
  companyFilter: string,
  quickFilters: QuickFilterKey[],
) {
  if (companyFilter !== "" && application.companyName !== companyFilter) {
    return false;
  }
  if (quickFilters.length === 0) return true;
  return QUICK_FILTERS.some(
    (filter) =>
      quickFilters.includes(filter.key) && filter.matches(application),
  );
}
