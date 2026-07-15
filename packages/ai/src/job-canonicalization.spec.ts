import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";
import type OpenAI from "openai";

import {
  type CanonicalJobJson,
  canonicalizeJobDescription,
} from "./job-canonicalization.js";

function createOutput(): CanonicalJobJson {
  return {
    title: "Senior Backend Engineer",
    company: "Acme",
    location: "Sao Paulo, SP",
    workMode: "hybrid",
    employmentType: "full_time",
    description: "Responsabilidades e requisitos reais da vaga.",
  };
}

function mockChatCompletion(content: string) {
  return mock.fn(async () => ({
    choices: [{ message: { content } }],
  }));
}

describe("canonicalizeJobDescription", () => {
  it("returns validated canonical job JSON", async () => {
    const output = createOutput();
    const chatCompletionsCreate = mockChatCompletion(JSON.stringify(output));

    const client = {
      chat: { completions: { create: chatCompletionsCreate } },
    } as unknown as OpenAI;

    const result = await canonicalizeJobDescription(
      client,
      "gpt-4.1-mini",
      "Texto bruto da vaga",
    );

    assert.deepEqual(result, output);
    const request = chatCompletionsCreate.mock.calls[0]?.arguments[0] as {
      response_format?: { type?: string };
    };
    assert.equal(request.response_format?.type, "json_object");
  });

  it("rejects malformed JSON", async () => {
    const client = {
      chat: { completions: { create: mockChatCompletion("{ invalid") } },
    } as unknown as OpenAI;

    await assert.rejects(
      () => canonicalizeJobDescription(client, "gpt-4.1-mini", "Texto bruto"),
      /parse canonical job json/i,
    );
  });

  it("falls back to null for unrecognized workMode (e.g. 'flex', 'presencial')", async () => {
    const client = {
      chat: {
        completions: {
          create: mockChatCompletion(
            JSON.stringify({ ...createOutput(), workMode: "flex" }),
          ),
        },
      },
    } as unknown as OpenAI;

    const result = await canonicalizeJobDescription(
      client,
      "gpt-4.1-mini",
      "Texto bruto",
    );
    assert.equal(result.workMode, null);
  });

  it("falls back to null for unrecognized employmentType (e.g. 'CLT', 'PJ')", async () => {
    const client = {
      chat: {
        completions: {
          create: mockChatCompletion(
            JSON.stringify({ ...createOutput(), employmentType: "CLT" }),
          ),
        },
      },
    } as unknown as OpenAI;

    const result = await canonicalizeJobDescription(
      client,
      "gpt-4.1-mini",
      "Texto bruto",
    );
    assert.equal(result.employmentType, null);
  });
});
