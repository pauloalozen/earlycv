import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildMaxOutputTokensParam,
  buildSystemMessage,
  stripJsonCodeFence,
} from "./prompt-cache.js";

describe("buildSystemMessage", () => {
  it("returns plain string content for non-Anthropic models", () => {
    const message = buildSystemMessage("deepseek/deepseek-v4-flash", "hello");
    assert.deepEqual(message, { role: "system", content: "hello" });
  });

  it("wraps content with cache_control for OpenRouter Anthropic models", () => {
    const message = buildSystemMessage("anthropic/claude-sonnet-4.6", "hello");
    assert.equal(message.role, "system");
    assert.deepEqual(message.content, [
      { type: "text", text: "hello", cache_control: { type: "ephemeral" } },
    ]);
  });
});

describe("buildMaxOutputTokensParam", () => {
  it("DeepSeek recebe max_tokens (parâmetro compatível atual)", () => {
    const param = buildMaxOutputTokensParam("deepseek", "deepseek-v4-flash", 8192);
    assert.deepEqual(param, { max_tokens: 8192 });
  });

  it("OpenAI gpt-5.4-mini recebe max_completion_tokens, nunca max_tokens", () => {
    const param = buildMaxOutputTokensParam("openai", "gpt-5.4-mini", 8192);
    assert.deepEqual(param, { max_completion_tokens: 8192 });
    assert.ok(!("max_tokens" in param), "nunca deveria ter os dois parâmetros juntos");
  });

  it("outros modelos 'reasoning' da OpenAI (o1/o3/o4) também recebem max_completion_tokens", () => {
    assert.deepEqual(
      buildMaxOutputTokensParam("openai", "o1-mini", 4096),
      { max_completion_tokens: 4096 },
    );
    assert.deepEqual(
      buildMaxOutputTokensParam("openai", "o3-mini", 4096),
      { max_completion_tokens: 4096 },
    );
    assert.deepEqual(
      buildMaxOutputTokensParam("openai", "o4-mini", 4096),
      { max_completion_tokens: 4096 },
    );
  });

  it("modelos OpenAI já suportados (gpt-4o-mini, gpt-4.1-mini) preservam max_tokens, sem alteração indevida", () => {
    assert.deepEqual(
      buildMaxOutputTokensParam("openai", "gpt-4o-mini", 8192),
      { max_tokens: 8192 },
    );
    assert.deepEqual(
      buildMaxOutputTokensParam("openai", "gpt-4.1-mini", 8192),
      { max_tokens: 8192 },
    );
  });

  it("um modelo 'gpt-5*' roteado via OpenRouter (provider != openai) continua usando max_tokens — a OpenRouter normaliza por trás", () => {
    const param = buildMaxOutputTokensParam("openrouter", "openai/gpt-5-mini", 8192);
    assert.deepEqual(param, { max_tokens: 8192 });
  });

  it("nunca produz os dois parâmetros de limite simultaneamente, em nenhum branch", () => {
    const cases: Array<[Parameters<typeof buildMaxOutputTokensParam>[0], string]> = [
      ["openai", "gpt-4o-mini"],
      ["openai", "gpt-5.4-mini"],
      ["deepseek", "deepseek-v4-flash"],
      ["openrouter", "anthropic/claude-sonnet-4.6"],
    ];
    for (const [provider, model] of cases) {
      const param = buildMaxOutputTokensParam(provider, model, 1000);
      const keys = Object.keys(param);
      assert.equal(keys.length, 1, `esperava exatamente 1 chave pra ${provider}/${model}, achou ${keys.length}`);
    }
  });

  it("configuração inválida (limite não positivo) falha claramente, nunca produz payload ambíguo", () => {
    assert.throws(() => buildMaxOutputTokensParam("openai", "gpt-4o-mini", 0));
    assert.throws(() => buildMaxOutputTokensParam("openai", "gpt-4o-mini", -1));
    assert.throws(() => buildMaxOutputTokensParam("openai", "gpt-4o-mini", Number.NaN));
    assert.throws(() => buildMaxOutputTokensParam("openai", "gpt-4o-mini", 8.5));
  });
});

describe("stripJsonCodeFence", () => {
  it("returns raw JSON content unchanged", () => {
    assert.equal(stripJsonCodeFence('{"a":1}'), '{"a":1}');
  });

  it("strips a ```json fence", () => {
    assert.equal(
      stripJsonCodeFence('```json\n{"a":1}\n```'),
      '{"a":1}',
    );
  });

  it("strips a bare ``` fence", () => {
    assert.equal(stripJsonCodeFence('```\n{"a":1}\n```'), '{"a":1}');
  });

  it("trims surrounding whitespace", () => {
    assert.equal(stripJsonCodeFence('  \n{"a":1}\n  '), '{"a":1}');
  });
});
