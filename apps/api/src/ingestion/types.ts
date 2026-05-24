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

export type IngestionPreviewItem = {
  action: IngestionPreviewAction;
  canonicalKey: string;
  message: string;
  title: string;
};

export type NormalizedJobObservation = {
  canonicalKey: string;
  city?: string;
  country?: string;
  descriptionClean: string;
  descriptionRaw: string;
  detailFetchSkipped?: boolean;
  employmentType?: string;
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
