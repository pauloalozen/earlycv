export type SourceDefaults = {
  crawlStrategy: "api" | "html";
  parserKey: string;
  sourceType: "custom_api" | "custom_html";
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
  isActive: boolean;
  parserKey: string;
  sourceName: string;
  sourceType: "custom_api" | "custom_html";
  sourceUrl: string;
};

function getTrimmedValue(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "").trim();

  return value.length > 0 ? value : undefined;
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

export function getSourceDefaults(sourceType: string): SourceDefaults {
  if (sourceType === "custom_api") {
    return {
      crawlStrategy: "api",
      parserKey: "custom_api",
      sourceType: "custom_api",
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

  const defaults = getSourceDefaults(sourceType);
  const checkIntervalMinutes = Number(intervalRaw);

  if (!Number.isInteger(checkIntervalMinutes) || checkIntervalMinutes < 1) {
    throw new Error("Informe um intervalo valido em minutos.");
  }

  return {
    checkIntervalMinutes,
    companyId,
    crawlStrategy: defaults.crawlStrategy,
    isActive: formData.get("isActive") === "on",
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
