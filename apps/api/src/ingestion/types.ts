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

export type IngestionSourceAdapter = {
  sourceType: JobSourceType;
  collect(jobSource: JobSourceContext): Promise<NormalizedJobObservation[]>;
};

export type JobSourceContext = Pick<
  JobSource,
  | "checkIntervalMinutes"
  | "companyId"
  | "crawlStrategy"
  | "id"
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
  failedCount: number;
  finishedAt: string | null;
  id: string;
  jobSourceId: string;
  newCount: number;
  previewItems: IngestionPreviewItem[];
  skippedCount: number;
  startedAt: string;
  status: IngestionRunStatus;
  updatedCount: number;
};
