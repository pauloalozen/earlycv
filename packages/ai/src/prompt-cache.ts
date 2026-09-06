import type OpenAI from "openai";
import type { AIProvider } from "./types.js";

type SystemMessage = OpenAI.Chat.Completions.ChatCompletionSystemMessageParam;

// OpenAI, DeepSeek e Gemini cacheiam automaticamente pelo prefixo do prompt —
// nenhum campo extra é necessário. A Anthropic (inclusive quando acessada via
// OpenRouter, onde o modelo vem prefixado "anthropic/...") exige um marcador
// cache_control explícito no bloco de conteúdo pra ativar o cache; sem ele o
// prompt de sistema (a maior parte do input em cada chamada) é reprocessado
// do zero em toda requisição.
export function buildSystemMessage(model: string, content: string): SystemMessage {
  if (!model.startsWith("anthropic/")) {
    return { role: "system", content };
  }

  return {
    role: "system",
    content: [
      // biome-ignore lint/suspicious/noExplicitAny: cache_control é extensão da Anthropic, fora do schema de content parts do SDK "openai"
      { type: "text", text: content, cache_control: { type: "ephemeral" } } as any,
    ],
  };
}

// A Anthropic (inclusive via OpenRouter) não respeita de forma estrita
// response_format: { type: "json_object" } — às vezes envolve a resposta em um
// code fence markdown (```json ... ``` ou ``` ... ```) mesmo quando o JSON em
// si está correto. Removemos o fence antes do JSON.parse; não faz diferença
// para respostas já em JSON puro (OpenAI/DeepSeek/Gemini).
export function stripJsonCodeFence(content: string): string {
  const trimmed = content.trim();
  const match = trimmed.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/i);
  return match ? match[1].trim() : trimmed;
}

// DeepSeek V4 roda em modo "thinking" (reasoning) por padrão: gera um
// reasoning_content extenso antes da resposta final, o que multiplica o tempo
// de geração sem ganho de qualidade mensurável nas nossas tarefas (saída
// estruturada em JSON). Medido: ~131s vs ~16s pro mesmo prompt de análise —
// estourava o timeout de 150s configurado em analysis-protection.facade.ts.
// Desligado via extra_body; outros supliers ignoram esse campo se enviado.
export function buildDeepSeekExtraBody(model: string): Record<string, unknown> {
  return model.startsWith("deepseek") ? { thinking: { type: "disabled" } } : {};
}

// Capacidade de limite de saída por provider/modelo, exposta pelo adapter —
// nunca decidida pelos services de negócio (eles só pedem "quero até N
// tokens de saída", nunca sabem o nome do parâmetro).
//
// Achado real (auditoria 2026-09-05): a família "reasoning" da OpenAI
// acessada via Chat Completions (o1, o3, o4, e a série gpt-5) REJEITA
// max_tokens com erro 400 explícito pedindo max_completion_tokens — um
// parâmetro que substitui, não complementa, max_tokens (nunca os dois
// juntos). Isso é uma particularidade documentada da OpenAI, não do
// endpoint Chat Completions em si: DeepSeek, Gemini, xAI, Anthropic (direto
// ou via OpenRouter) e a própria OpenRouter (que normaliza o parâmetro por
// trás, mesmo quando a rota aponta pra um modelo "openai/gpt-5*") continuam
// aceitando max_tokens normalmente no mesmo endpoint. Por isso o escopo da
// checagem abaixo é estritamente `provider === "openai"` — nunca por nome
// de modelo isolado, que apareceria de novo (com significado diferente) em
// rotas OpenRouter.
//
// Nenhum código deste projeto usa a Responses API (client.responses.create)
// hoje — só Chat Completions, em todo lugar. Se isso mudar no futuro,
// max_output_tokens (o parâmetro da Responses API) entra como um terceiro
// branch aqui, no mesmo lugar central — nunca espalhado pelos services.
const OPENAI_REQUIRES_MAX_COMPLETION_TOKENS = /^(o1|o3|o4|gpt-5)/;

export type MaxOutputTokensParam =
  | { max_tokens: number }
  | { max_completion_tokens: number };

export function buildMaxOutputTokensParam(
  provider: AIProvider,
  model: string,
  maxOutputTokens: number,
): MaxOutputTokensParam {
  if (
    !Number.isFinite(maxOutputTokens) ||
    !Number.isInteger(maxOutputTokens) ||
    maxOutputTokens <= 0
  ) {
    // Falha explícita, nunca um payload ambíguo: um limite inválido não
    // deveria silenciosamente virar "sem limite" nem um valor arbitrário.
    throw new Error(
      `buildMaxOutputTokensParam: maxOutputTokens inválido (${maxOutputTokens}) — precisa ser um inteiro positivo`,
    );
  }

  if (provider === "openai" && OPENAI_REQUIRES_MAX_COMPLETION_TOKENS.test(model)) {
    return { max_completion_tokens: maxOutputTokens };
  }

  return { max_tokens: maxOutputTokens };
}
