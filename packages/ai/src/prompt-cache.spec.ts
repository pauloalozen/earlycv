import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildSystemMessage, stripJsonCodeFence } from "./prompt-cache.js";

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
