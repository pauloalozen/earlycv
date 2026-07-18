import type OpenAI from "openai";

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
