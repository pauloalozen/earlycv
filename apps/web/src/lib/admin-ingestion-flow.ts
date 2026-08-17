export type JobSourceTypeOption =
  | "custom_api"
  | "custom_html"
  | "gupy"
  | "greenhouse"
  | "lever"
  | "ashby"
  | "inhire"
  | "teamtailor"
  | "talentbrew"
  | "workday"
  | "solides"
  | "pandape";

// Source types selectable in the admin UI. solides/pandape don't have an
// adapter implemented yet — creating a source with one of these types only
// tags the company for later; running it will fail until the matching
// adapter ships.
export const JOB_SOURCE_TYPE_OPTIONS: JobSourceTypeOption[] = [
  "gupy",
  "custom_html",
  "custom_api",
  "greenhouse",
  "lever",
  "ashby",
  "inhire",
  "teamtailor",
  "talentbrew",
  "workday",
  "solides",
  "pandape",
];

export type SourceDefaults = {
  crawlStrategy: "api" | "html";
  parserKey: string;
  sourceType: JobSourceTypeOption;
};

export type CreateCompanyInput = {
  careersUrl?: string;
  country?: string;
  industry?: string;
  linkedinUrl?: string;
  name: string;
  websiteUrl?: string;
};

export type CreateJobSourceInput = {
  checkIntervalMinutes: number;
  companyId: string;
  crawlStrategy: "api" | "html";
  isFallbackAdapter?: boolean;
  isActive: boolean;
  parserKey: string;
  scheduleCron?: string;
  scheduleEnabled?: boolean;
  scheduleTimezone?: "America/Sao_Paulo";
  sourceName: string;
  sourceType: JobSourceTypeOption;
  sourceUrl: string;
};

export const MANUAL_ADAPTER_TYPES = [
  "gupy",
  "custom_html",
  "custom_api",
  "greenhouse",
  "lever",
  "ashby",
  "inhire",
  "teamtailor",
  "talentbrew",
  "workday",
  "pandape",
] as const;

export type ManualAdapterType = (typeof MANUAL_ADAPTER_TYPES)[number];

function getTrimmedValue(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "").trim();

  return value.length > 0 ? value : undefined;
}

function inferGupySourceTypeFromUrl(sourceUrl: string) {
  try {
    const hostname = new URL(sourceUrl).hostname.toLowerCase();
    return hostname.endsWith(".gupy.io");
  } catch {
    return false;
  }
}

export function buildAdminRedirect(
  redirectPath: string,
  status: "error" | "success",
  message: string,
  extras?: Record<string, string>,
) {
  const url = new URL(`http://localhost${redirectPath}`);

  url.searchParams.set("status", status);
  url.searchParams.set("message", message);

  for (const [key, value] of Object.entries(extras ?? {})) {
    url.searchParams.set(key, value);
  }

  return `${url.pathname}?${url.searchParams.toString()}`;
}

// ATS types without an adapter yet — API-based platforms, same shape as
// gupy/custom_api, so crawlStrategy defaults to "api". They only exist so
// companies can be tagged now; running them fails until the adapter ships.
const UNIMPLEMENTED_API_SOURCE_TYPES: JobSourceTypeOption[] = ["solides"];

export function getSourceDefaults(sourceType: string): SourceDefaults {
  if (sourceType === "gupy") {
    return {
      crawlStrategy: "api",
      parserKey: "gupy",
      sourceType: "gupy",
    };
  }

  if (sourceType === "custom_api") {
    return {
      crawlStrategy: "api",
      parserKey: "custom_api",
      sourceType: "custom_api",
    };
  }

  if (sourceType === "greenhouse") {
    return {
      crawlStrategy: "api",
      parserKey: "greenhouse",
      sourceType: "greenhouse",
    };
  }

  if (sourceType === "lever") {
    return {
      crawlStrategy: "api",
      parserKey: "lever",
      sourceType: "lever",
    };
  }

  if (sourceType === "ashby") {
    return {
      crawlStrategy: "api",
      parserKey: "ashby",
      sourceType: "ashby",
    };
  }

  if (sourceType === "inhire") {
    return {
      crawlStrategy: "api",
      parserKey: "inhire",
      sourceType: "inhire",
    };
  }

  if (sourceType === "teamtailor") {
    return {
      crawlStrategy: "api",
      parserKey: "teamtailor",
      sourceType: "teamtailor",
    };
  }

  if (sourceType === "talentbrew") {
    return {
      crawlStrategy: "api",
      parserKey: "talentbrew",
      sourceType: "talentbrew",
    };
  }

  if (sourceType === "workday") {
    return {
      crawlStrategy: "api",
      parserKey: "workday",
      sourceType: "workday",
    };
  }

  if (sourceType === "pandape") {
    return {
      crawlStrategy: "api",
      parserKey: "pandape",
      sourceType: "pandape",
    };
  }

  const unimplementedType = UNIMPLEMENTED_API_SOURCE_TYPES.find(
    (type) => type === sourceType,
  );
  if (unimplementedType) {
    return {
      crawlStrategy: "api",
      parserKey: unimplementedType,
      sourceType: unimplementedType,
    };
  }

  return {
    crawlStrategy: "html",
    parserKey: "custom_html",
    sourceType: "custom_html",
  };
}

export function parseCompanyFormData(formData: FormData): CreateCompanyInput {
  const name = getTrimmedValue(formData, "name");

  if (!name) {
    throw new Error("Informe o nome da empresa.");
  }

  return {
    ...(getTrimmedValue(formData, "careersUrl")
      ? { careersUrl: getTrimmedValue(formData, "careersUrl") }
      : {}),
    ...(getTrimmedValue(formData, "country")
      ? { country: getTrimmedValue(formData, "country") }
      : {}),
    ...(getTrimmedValue(formData, "industry")
      ? { industry: getTrimmedValue(formData, "industry") }
      : {}),
    ...(getTrimmedValue(formData, "linkedinUrl")
      ? { linkedinUrl: getTrimmedValue(formData, "linkedinUrl") }
      : {}),
    name,
    ...(getTrimmedValue(formData, "websiteUrl")
      ? { websiteUrl: getTrimmedValue(formData, "websiteUrl") }
      : {}),
  };
}

export function parseJobSourceFormData(
  formData: FormData,
): CreateJobSourceInput {
  const companyId = getTrimmedValue(formData, "companyId");
  const sourceName = getTrimmedValue(formData, "sourceName");
  const sourceType = getTrimmedValue(formData, "sourceType") ?? "custom_html";
  const sourceUrl = getTrimmedValue(formData, "sourceUrl");
  const intervalRaw = getTrimmedValue(formData, "checkIntervalMinutes");

  if (!companyId) {
    throw new Error("Empresa ausente para criar a fonte.");
  }

  if (!sourceName || !sourceUrl || !intervalRaw) {
    throw new Error("Preencha os campos obrigatorios da fonte.");
  }

  const effectiveSourceType =
    sourceUrl && inferGupySourceTypeFromUrl(sourceUrl) ? "gupy" : sourceType;
  const defaults = getSourceDefaults(effectiveSourceType);
  const checkIntervalMinutes = Number(intervalRaw);

  if (!Number.isInteger(checkIntervalMinutes) || checkIntervalMinutes < 1) {
    throw new Error("Informe um intervalo valido em minutos.");
  }

  return {
    checkIntervalMinutes,
    companyId,
    crawlStrategy: defaults.crawlStrategy,
    isActive: formData.get("isActive") === "on",
    ...(formData.get("scheduleEnabled") === "on"
      ? {
          scheduleEnabled: true,
          scheduleCron:
            getTrimmedValue(formData, "scheduleCron") ?? "*/30 * * * *",
          scheduleTimezone: "America/Sao_Paulo" as const,
        }
      : {}),
    parserKey: defaults.parserKey,
    sourceName,
    sourceType: defaults.sourceType,
    sourceUrl,
    isFallbackAdapter: defaults.sourceType === "custom_html",
  };
}

export type UpdateJobSourceInput = {
  checkIntervalMinutes: number;
  crawlStrategy: "api" | "html";
  isActive: boolean;
  isFallbackAdapter: boolean;
  parserKey: string;
  sourceName: string;
  sourceType: JobSourceTypeOption;
  sourceUrl: string;
};

export function parseUpdateJobSourceFormData(
  formData: FormData,
): UpdateJobSourceInput {
  const sourceName = getTrimmedValue(formData, "sourceName");
  const sourceType = getTrimmedValue(formData, "sourceType") ?? "custom_html";
  const sourceUrl = getTrimmedValue(formData, "sourceUrl");
  const intervalRaw = getTrimmedValue(formData, "checkIntervalMinutes");

  if (!sourceName || !sourceUrl || !intervalRaw) {
    throw new Error("Preencha os campos obrigatorios da fonte.");
  }

  const effectiveSourceType =
    sourceUrl && inferGupySourceTypeFromUrl(sourceUrl) ? "gupy" : sourceType;
  const defaults = getSourceDefaults(effectiveSourceType);
  const checkIntervalMinutes = Number(intervalRaw);

  if (!Number.isInteger(checkIntervalMinutes) || checkIntervalMinutes < 1) {
    throw new Error("Informe um intervalo valido em minutos.");
  }

  return {
    checkIntervalMinutes,
    crawlStrategy: defaults.crawlStrategy,
    isActive: formData.get("isActive") === "on",
    isFallbackAdapter: defaults.sourceType === "custom_html",
    parserKey: defaults.parserKey,
    sourceName,
    sourceType: defaults.sourceType,
    sourceUrl,
  };
}

export function isRedirectControlFlowError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    typeof error.digest === "string" &&
    error.digest.startsWith("NEXT_REDIRECT")
  );
}

export function parseManualAdapterType(
  value: FormDataEntryValue | null,
): ManualAdapterType {
  const adapterType = String(value ?? "").trim();
  if (!adapterType) {
    throw new Error("Informe o tipo de adaptador para execucao manual.");
  }

  if (!MANUAL_ADAPTER_TYPES.includes(adapterType as ManualAdapterType)) {
    throw new Error("Tipo de adaptador invalido.");
  }

  return adapterType as ManualAdapterType;
}

export function parseManualBatchRunId(
  value: FormDataEntryValue | null,
): string {
  const batchRunId = String(value ?? "").trim();
  if (!batchRunId) {
    throw new Error("Informe o lote manual.");
  }
  return batchRunId;
}
