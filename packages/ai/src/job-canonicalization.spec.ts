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

describe("canonicalizeJobDescription", () => {
  it("returns validated canonical job JSON", async () => {
    const output = createOutput();
    const responsesCreate = mock.fn(async () => ({
      output_text: JSON.stringify(output),
    }));

    const client = {
      responses: { create: responsesCreate },
    } as unknown as OpenAI;

    const result = await canonicalizeJobDescription(
      client,
      "gpt-4.1-mini",
      "Texto bruto da vaga",
    );

    assert.deepEqual(result, output);
    const request = responsesCreate.mock.calls[0]?.arguments[0] as {
      text?: { format?: { type?: string } };
    };
    assert.equal(request.text?.format?.type, "json_object");
  });

  it("rejects malformed JSON", async () => {
    const client = {
      responses: {
        create: mock.fn(async () => ({ output_text: "{ invalid" })),
      },
    } as unknown as OpenAI;

    await assert.rejects(
      () => canonicalizeJobDescription(client, "gpt-4.1-mini", "Texto bruto"),
      /parse canonical job json/i,
    );
  });

  it("falls back to null for unrecognized workMode (e.g. 'flex', 'presencial')", async () => {
    const client = {
      responses: {
        create: mock.fn(async () => ({
          output_text: JSON.stringify({
            ...createOutput(),
            workMode: "flex",
          }),
        })),
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
      responses: {
        create: mock.fn(async () => ({
          output_text: JSON.stringify({
            ...createOutput(),
            employmentType: "CLT",
          }),
        })),
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
