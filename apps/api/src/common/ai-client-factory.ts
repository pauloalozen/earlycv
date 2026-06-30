import OpenAI from "openai";

export type AiSupplier = "openai" | "xai" | "anthropic";

export function getActiveAiSupplier(): AiSupplier {
  const supplier = process.env.AI_SUPPLIER ?? "openai";
  if (supplier === "xai" || supplier === "anthropic") return supplier;
  return "openai";
}

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

  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

// operation: sufixo da env var de override por operação, ex: "JOB_CANONICALIZATION", "MASTERCV"
export function getAiModel(operation?: string): string {
  const supplier = getActiveAiSupplier();

  if (supplier === "xai") {
    const perOp = operation ? process.env[`XAI_MODEL_${operation}`] : undefined;
    return perOp ?? process.env.XAI_MODEL ?? "grok-3-mini";
  }

  if (supplier === "anthropic") {
    const perOp = operation
      ? process.env[`ANTHROPIC_MODEL_${operation}`]
      : undefined;
    return perOp ?? process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";
  }

  const perOp = operation
    ? process.env[`OPENAI_MODEL_${operation}`]
    : undefined;
  return perOp ?? process.env.OPENAI_MODEL ?? "gpt-4o-mini";
}
