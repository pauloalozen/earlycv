import OpenAI from "openai";

export type AiSupplier =
  | "openai"
  | "xai"
  | "anthropic"
  | "gemini"
  | "kimi"
  | "glm"
  | "deepseek"
  | "openrouter";

const AI_SUPPLIERS: readonly AiSupplier[] = [
  "openai",
  "xai",
  "anthropic",
  "gemini",
  "kimi",
  "glm",
  "deepseek",
  "openrouter",
];

const DEFAULT_MODEL_BY_SUPPLIER: Record<AiSupplier, string> = {
  openai: "gpt-4o-mini",
  xai: "grok-3-mini",
  anthropic: "claude-sonnet-4-6",
  gemini: "gemini-2.5-flash",
  kimi: "kimi-k2.6",
  glm: "glm-5.2",
  deepseek: "deepseek-v4-flash",
  openrouter: "openai/gpt-4o-mini",
};

type AiConfig = { supplier: AiSupplier; model: string };

const DEFAULT_AI_CONFIG: AiConfig = {
  supplier: "openai",
  model: DEFAULT_MODEL_BY_SUPPLIER.openai,
};

// Uma única variável por etapa carrega fornecedor e modelo juntos, separados
// por "|" (ex: AI_SUPPLIER_ANALYSIS=deepseek|deepseek-v4-flash). O nome do
// modelo pode conter "/" livremente (ex: rota OpenRouter
// "anthropic/claude-sonnet-4.6") — só o primeiro "|" separa fornecedor de
// modelo.
function parseAiConfig(raw: string | undefined): AiConfig | null {
  if (!raw) return null;
  const separatorIndex = raw.indexOf("|");
  if (separatorIndex === -1) return null;

  const supplierRaw = raw.slice(0, separatorIndex).trim();
  const model = raw.slice(separatorIndex + 1).trim();
  if (!model || !AI_SUPPLIERS.includes(supplierRaw as AiSupplier)) {
    return null;
  }

  return { supplier: supplierRaw as AiSupplier, model };
}

// operation: identifica a etapa (ex: "ANALYSIS", "CV_GENERATION",
// "JOB_CANONICALIZATION", "MASTERCV", "INTERVIEW_PREP"). Permite escolher um
// fornecedor+modelo diferente por etapa via AI_SUPPLIER_<OPERATION>, caindo
// para o AI_SUPPLIER global quando não houver override específico.
function resolveAiConfig(operation?: string): AiConfig {
  const perOp = operation
    ? parseAiConfig(process.env[`AI_SUPPLIER_${operation}`])
    : null;
  return perOp ?? parseAiConfig(process.env.AI_SUPPLIER) ?? DEFAULT_AI_CONFIG;
}

export function getActiveAiSupplier(operation?: string): AiSupplier {
  return resolveAiConfig(operation).supplier;
}

// Todos os supliers abaixo (inclusive Anthropic e os novos, e o OpenRouter como
// agregador multi-modelo) expõem um endpoint OpenAI-compatible: basta trocar
// baseURL/headers para reaproveitar o SDK "openai" em vez de instanciar um SDK
// diferente por provedor.
export function createAiClientFromEnv(operation?: string): OpenAI {
  const supplier = getActiveAiSupplier(operation);

  if (supplier === "xai") {
    return new OpenAI({
      apiKey: process.env.XAI_API_KEY,
      baseURL: process.env.XAI_BASE_URL ?? "https://api.x.ai/v1",
    });
  }

  if (supplier === "anthropic") {
    return new OpenAI({
      apiKey: process.env.ANTHROPIC_API_KEY,
      baseURL: process.env.ANTHROPIC_BASE_URL ?? "https://api.anthropic.com/v1",
      defaultHeaders: { "anthropic-version": "2023-06-01" },
    });
  }

  if (supplier === "gemini") {
    return new OpenAI({
      apiKey: process.env.GEMINI_API_KEY,
      baseURL:
        process.env.GEMINI_BASE_URL ??
        "https://generativelanguage.googleapis.com/v1beta/openai/",
    });
  }

  if (supplier === "kimi") {
    return new OpenAI({
      apiKey: process.env.MOONSHOT_API_KEY,
      baseURL: process.env.MOONSHOT_BASE_URL ?? "https://api.moonshot.ai/v1",
    });
  }

  if (supplier === "glm") {
    return new OpenAI({
      apiKey: process.env.ZAI_API_KEY,
      baseURL: process.env.ZAI_BASE_URL ?? "https://api.z.ai/api/paas/v4",
    });
  }

  if (supplier === "deepseek") {
    return new OpenAI({
      apiKey: process.env.DEEPSEEK_API_KEY,
      baseURL: process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com",
    });
  }

  if (supplier === "openrouter") {
    return new OpenAI({
      apiKey: process.env.OPENROUTER_API_KEY,
      baseURL: process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1",
      defaultHeaders: {
        ...(process.env.OPENROUTER_SITE_URL && {
          "HTTP-Referer": process.env.OPENROUTER_SITE_URL,
        }),
        ...(process.env.OPENROUTER_SITE_NAME && {
          "X-Title": process.env.OPENROUTER_SITE_NAME,
        }),
      },
    });
  }

  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

// operation: mesma etapa usada em getActiveAiSupplier — resolve do mesmo
// AI_SUPPLIER_<OPERATION>|modelo (ou AI_SUPPLIER global) para manter
// fornecedor e modelo sempre consistentes entre si.
export function getAiModel(operation?: string): string {
  return resolveAiConfig(operation).model;
}
