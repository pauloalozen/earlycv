import assert from "node:assert/strict";
import { test } from "node:test";

import type { CanonicalJobJson } from "./job-canonicalization";
import {
  buildCanonicalJobHash,
  buildRawJobHash,
  buildRequirementSourceHash,
  normalizeRawJobText,
} from "./job-canonicalization";
import { JobCanonicalizationService } from "./job-canonicalization.service";

function makeCanonicalJobJson(
  overrides: Partial<CanonicalJobJson> = {},
): CanonicalJobJson {
  return {
    title: "Senior Backend Engineer",
    company: "Acme",
    location: "Sao Paulo, SP",
    workMode: "hybrid",
    employmentType: "full_time",
    description: "Responsabilidades reais da vaga e stack exigida.",
    ...overrides,
  };
}

function makeRawRecord(rawJobHash: string, canonicalJobJson: CanonicalJobJson) {
  return {
    rawJobHash,
    canonicalJob: {
      id: "canonical-1",
      canonicalJobHash: buildCanonicalJobHash(canonicalJobJson),
      requirementSourceHash: buildRequirementSourceHash(canonicalJobJson),
      canonicalJobJson,
    },
  };
}

test("rawJobHash is stable across case and spacing differences", () => {
  const first = normalizeRawJobText("Senior Backend Engineer\n\nSQL   Python");
  const second = normalizeRawJobText(
    "senior backend engineer\r\n\r\nsql python",
  );

  assert.equal(buildRawJobHash(first), buildRawJobHash(second));
});

test("returns existing canonical job by rawJobHash without calling LLM", async () => {
  const canonicalJobJson = makeCanonicalJobJson();
  const normalizedRawText = normalizeRawJobText("Texto bruto da vaga");
  const rawJobHash = buildRawJobHash(normalizedRawText);
  let llmCalls = 0;

  const service = new JobCanonicalizationService(
    {
      jobRawInput: {
        findUnique: async () => makeRawRecord(rawJobHash, canonicalJobJson),
      },
      canonicalJob: {
        findUnique: async () => null,
        create: async () => {
          throw new Error("canonicalJob.create should not run");
        },
      },
    } as never,
    {} as never,
    {
      canonicalize: async () => {
        llmCalls += 1;
        return canonicalJobJson;
      },
    },
  );

  const result = await service.getOrCreateCanonicalJob("Texto bruto da vaga");

  assert.equal(result.reusedByRawHash, true);
  assert.equal(result.reusedByCanonicalHash, false);
  assert.equal(result.canonicalJobId, "canonical-1");
  assert.equal(
    result.requirementSourceHash,
    buildRequirementSourceHash(canonicalJobJson),
  );
  assert.equal(llmCalls, 0);
});

test("calls LLM when rawJobHash does not exist", async () => {
  const canonicalJobJson = makeCanonicalJobJson();
  let llmCalls = 0;

  const service = new JobCanonicalizationService(
    {
      jobRawInput: {
        findUnique: async () => null,
        create: async () => ({ id: "raw-1" }),
      },
      canonicalJob: {
        findUnique: async () => null,
        create: async () => ({ id: "canonical-1" }),
      },
    } as never,
    {} as never,
    {
      canonicalize: async () => {
        llmCalls += 1;
        return canonicalJobJson;
      },
    },
  );

  const result = await service.getOrCreateCanonicalJob("Nova vaga");

  assert.equal(llmCalls, 1);
  assert.equal(result.reusedByRawHash, false);
  assert.equal(
    result.requirementSourceHash,
    buildRequirementSourceHash(canonicalJobJson),
  );
});

test("reuses existing CanonicalJob when canonicalJobHash already exists", async () => {
  const canonicalJobJson = makeCanonicalJobJson();
  const createdRawInputs: Array<{ data?: { canonicalJobId?: string } }> = [];

  const service = new JobCanonicalizationService(
    {
      jobRawInput: {
        findUnique: async () => null,
        create: async (args: { data?: { canonicalJobId?: string } }) => {
          createdRawInputs.push(args);
          return { id: "raw-2" };
        },
      },
      canonicalJob: {
        findUnique: async () => ({
          id: "canonical-existing",
          canonicalJobHash: buildCanonicalJobHash(canonicalJobJson),
          requirementSourceHash: buildRequirementSourceHash(canonicalJobJson),
          canonicalJobJson,
        }),
        create: async () => {
          throw new Error("canonicalJob.create should not run");
        },
      },
    } as never,
    {} as never,
    {
      canonicalize: async () => canonicalJobJson,
    },
  );

  const result = await service.getOrCreateCanonicalJob("Mesma vaga com ruido");

  assert.equal(result.canonicalJobId, "canonical-existing");
  assert.equal(result.reusedByCanonicalHash, true);
  assert.equal(createdRawInputs[0]?.data?.canonicalJobId, "canonical-existing");
});

test("creates CanonicalJob and JobRawInput when canonicalJobHash is new", async () => {
  const canonicalJobJson = makeCanonicalJobJson();
  const createdCanonical: Array<{ data?: { requirementSourceHash?: string } }> =
    [];
  const createdRaw: Array<Record<string, unknown>> = [];

  const service = new JobCanonicalizationService(
    {
      jobRawInput: {
        findUnique: async () => null,
        create: async (args: Record<string, unknown>) => {
          createdRaw.push(args);
          return { id: "raw-created" };
        },
      },
      canonicalJob: {
        findUnique: async () => null,
        create: async (args: { data?: { requirementSourceHash?: string } }) => {
          createdCanonical.push(args);
          return { id: "canonical-created" };
        },
      },
    } as never,
    {} as never,
    {
      canonicalize: async () => canonicalJobJson,
    },
  );

  const result = await service.getOrCreateCanonicalJob("Nova vaga canonical");

  assert.equal(result.canonicalJobId, "canonical-created");
  assert.equal(createdCanonical.length, 1);
  assert.equal(createdRaw.length, 1);
  assert.equal(
    createdCanonical[0]?.data?.requirementSourceHash,
    buildRequirementSourceHash(canonicalJobJson),
  );
});

test("canonicalJobHash is stable for the same canonicalJobJson", () => {
  const canonicalJobJson = makeCanonicalJobJson();

  assert.equal(
    buildCanonicalJobHash(canonicalJobJson),
    buildCanonicalJobHash({ ...canonicalJobJson }),
  );
});

test("requirementSourceHash depends only on canonical description", () => {
  const first = makeCanonicalJobJson({
    title: "Backend Engineer",
    company: "Acme",
    description: "Mesmos requisitos e responsabilidades.",
  });
  const second = makeCanonicalJobJson({
    title: "Software Engineer",
    company: "Beta",
    location: "Remote",
    workMode: "remote",
    employmentType: "contract",
    description: "Mesmos requisitos e responsabilidades.",
  });

  assert.notEqual(buildCanonicalJobHash(first), buildCanonicalJobHash(second));
  assert.equal(
    buildRequirementSourceHash(first),
    buildRequirementSourceHash(second),
  );
});

test("different canonical descriptions produce different requirementSourceHash values", () => {
  const first = makeCanonicalJobJson({
    title: "Backend Engineer",
    company: "Acme",
    description: "Node.js, Postgres, mensageria e observabilidade.",
  });
  const second = makeCanonicalJobJson({
    title: "Backend Engineer",
    company: "Acme",
    description: "Go, Kafka, Redis e arquitetura distribuida.",
  });

  assert.notEqual(buildCanonicalJobHash(first), buildCanonicalJobHash(second));
  assert.notEqual(
    buildRequirementSourceHash(first),
    buildRequirementSourceHash(second),
  );
});

test("resolves concurrent unique constraint races by refetching existing raw input", async () => {
  const canonicalJobJson = makeCanonicalJobJson();
  const normalizedRawText = normalizeRawJobText("vaga concorrente");
  const rawJobHash = buildRawJobHash(normalizedRawText);
  let rawFindCalls = 0;

  const service = new JobCanonicalizationService(
    {
      jobRawInput: {
        findUnique: async () => {
          rawFindCalls += 1;
          if (rawFindCalls === 1) {
            return null;
          }
          return makeRawRecord(rawJobHash, canonicalJobJson);
        },
        create: async () => ({ id: "raw-concurrent" }),
      },
      canonicalJob: {
        findUnique: async () => null,
        create: async () => {
          throw { code: "P2002" };
        },
      },
    } as never,
    {} as never,
    {
      canonicalize: async () => canonicalJobJson,
    },
  );

  const result = await service.getOrCreateCanonicalJob("vaga concorrente");

  assert.equal(result.reusedByRawHash, true);
  assert.equal(result.canonicalJobId, "canonical-1");
});
