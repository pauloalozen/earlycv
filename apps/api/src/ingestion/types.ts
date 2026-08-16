import type {
  IngestionRunStatus,
  JobSource,
  JobSourceType,
} from "@prisma/client";

export type IngestionPreviewAction =
  | "created"
  | "updated"
  | "skipped"
  | "failed";

// null = Job existe mas nao tem JobEnrichment (vaga antiga, anterior ao
// trigger de enriquecimento). undefined = campo nao calculado por esse
// endpoint (so getRun/getRunById preenchem, pra nao pagar o join extra
// em toda listagem de runs).
export type IngestionPreviewItemEnrichment = {
  careerFingerprint: string[];
  dominantArea: string | null;
  enrichmentStatus: string;
  id: string;
  semanticFilterReason: string | null;
} | null;

export type IngestionPreviewItem = {
  action: IngestionPreviewAction;
  canonicalKey: string;
  enrichment?: IngestionPreviewItemEnrichment;
  message: string;
  title: string;
};

export type NormalizedJobObservation = {
  canonicalKey: string;
  city?: string;
  country?: string;
  department?: string | null;
  descriptionClean: string;
  descriptionRaw: string;
  detailFetchSkipped?: boolean;
  employmentType?: string;
  employmentTypeRaw?: string | null;
  externalJobId?: string;
  firstSeenAt: string;
  lastSeenAt: string;
  locationText: string;
  normalizedTitle: string;
  publishedAtSource?: string;
  seniorityLevel?: string;
  sourceJobUrl: string;
  state?: string;
  status?: "active" | "inactive" | "removed";
  title: string;
  workModel?: string;
};

export type IngestionCollectContext = {
  getExistingJobByCanonicalKey(
    canonicalKey: string,
  ): Promise<{ lastSeenAt: Date | null } | null>;
  ingestionRunId?: string;
  // Chamado toda vez que o filtro semantico descarta um titulo (SKIP) —
  // usado pela Descoberta de Empresas pra distinguir "board vazio" de
  // "board tem vagas, nenhuma de tech" (ver probeSource).
  onSemanticFilterSkip?(): void;
};

export type IngestionSourceAdapter = {
  sourceType: JobSourceType;
  collect(
    jobSource: JobSourceContext,
    context?: IngestionCollectContext,
  ): Promise<NormalizedJobObservation[]>;
};

export type JobSourceContext = Pick<
  JobSource,
  | "checkIntervalMinutes"
  | "companyId"
  | "crawlStrategy"
  | "consecutive403Count"
  | "id"
  | "pauseReason"
  | "pausedUntil"
  | "parserKey"
  | "sourceName"
  | "sourceType"
  | "sourceUrl"
> & {
  company: {
    id: string;
    name: string;
    normalizedName: string;
  };
};

export type IngestionRunSummary = {
  companyId?: string;
  companyName?: string;
  discardedByFilterCount?: number;
  errorSummary?: string | null;
  failedCount: number;
  finishedAt: string | null;
  id: string;
  jobSourceId: string;
  currentConsecutive403?: number;
  detailFetchSkippedCount?: number;
  newCount: number;
  pauseTriggered?: boolean;
  previewItems: IngestionPreviewItem[];
  sourceName?: string;
  skippedCount: number;
  startedAt: string;
  staleMarkedCount?: number;
  status: IngestionRunStatus;
  updatedCount: number;
};
