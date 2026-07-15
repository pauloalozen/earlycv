import OpenAI from "openai";

export type AiSupplier =
  | "openai"
  | "xai"
  | "anthropic"
  | "gemini"
  | "kimi"
  | "glm"
  | "deepseek";

const AI_SUPPLIERS: readonly AiSupplier[] = [
  "openai",
  "xai",
  "anthropic",
  "gemini",
  "kimi",
  "glm",
  "deepseek",
];

export function getActiveAiSupplier(): AiSupplier {
  const supplier = process.env.AI_SUPPLIER ?? "openai";
  return AI_SUPPLIERS.includes(supplier as AiSupplier)
    ? (supplier as AiSupplier)
    : "openai";
}

// Todos os supliers abaixo (inclusive Anthropic e os novos) expõem um endpoint
// OpenAI-compatible: basta trocar baseURL/headers para reaproveitar o SDK "openai"
// em vez de instanciar um SDK diferente por provedor.
export function createAiClientFromEnv(): OpenAI {
  const supplier = getActiveAiSupplier();

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

  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

const DEFAULT_MODEL_BY_SUPPLIER: Record<AiSupplier, string> = {
  openai: "gpt-4o-mini",
  xai: "grok-3-mini",
  anthropic: "claude-sonnet-4-6",
  gemini: "gemini-2.5-flash",
  kimi: "kimi-k2.6",
  glm: "glm-5.2",
  deepseek: "deepseek-v4-flash",
};

const MODEL_ENV_PREFIX_BY_SUPPLIER: Record<AiSupplier, string> = {
  openai: "OPENAI_MODEL",
  xai: "XAI_MODEL",
  anthropic: "ANTHROPIC_MODEL",
  gemini: "GEMINI_MODEL",
  kimi: "MOONSHOT_MODEL",
  glm: "ZAI_MODEL",
  deepseek: "DEEPSEEK_MODEL",
};

// operation: sufixo da env var de override por operação, ex: "JOB_CANONICALIZATION", "MASTERCV"
export function getAiModel(operation?: string): string {
  const supplier = getActiveAiSupplier();
  const envPrefix = MODEL_ENV_PREFIX_BY_SUPPLIER[supplier];

  const perOp = operation
    ? process.env[`${envPrefix}_${operation}`]
    : undefined;
  return perOp ?? process.env[envPrefix] ?? DEFAULT_MODEL_BY_SUPPLIER[supplier];
}
