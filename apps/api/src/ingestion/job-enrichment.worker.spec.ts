import assert from "node:assert/strict";
import { test } from "node:test";
import { JobEnrichmentWorker } from "./job-enrichment.worker";
import type { JobEnrichmentLlmResult } from "./job-enrichment-llm";

type EnrichmentRecord = {
  attempts: number;
  createdAt: Date;
  enrichmentError: string | null;
  enrichmentStatus: string;
  id: string;
  jobId: string;
  semanticFilterReason: string | null;
  semanticFilterResult: string;
  semanticFilterVersion: string | null;
} & Partial<JobEnrichmentLlmResult> & {
    enrichedAt?: Date | null;
    enrichmentModel?: string | null;
    enrichmentVersion?: string | null;
  };

type JobRecord = {
  descriptionClean: string;
  metadataJson: unknown;
  normalizedTitle: string;
  title: string;
};

type EvaluateResult = {
  configVersion: string;
  reason: string;
  result: "ENRICH" | "SKIP";
};

function createFixture() {
  const enrichments = new Map<string, EnrichmentRecord>();
  const jobs = new Map<string, JobRecord>();

  const database = {
    jobEnrichment: {
      findMany: async ({
        take,
        where,
      }: {
        take: number;
        where: { enrichmentStatus: string };
      }) =>
        Array.from(enrichments.values())
          .filter((item) => item.enrichmentStatus === where.enrichmentStatus)
          .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
          .slice(0, take)
          .map((item) => ({ ...item, job: jobs.get(item.jobId) })),
      findUnique: async ({ where }: { where: { id: string } }) => {
        const item = enrichments.get(where.id);
        if (!item) return null;
        return { ...item, job: jobs.get(item.jobId) };
      },
      update: async ({
        data,
        where,
      }: {
        data: Partial<EnrichmentRecord>;
        where: { id: string };
      }) => {
        const current = enrichments.get(where.id);
        assert.ok(current, `enrichment ${where.id} must exist`);
        const next = { ...current, ...data };
        enrichments.set(where.id, next);
        return next;
      },
    },
  };

  const lockRepository = {
    acquire: async () => true,
    release: async () => undefined,
  };

  let enrichmentConfig = {
    enrichmentBatchSize: 10,
    enrichmentCronExpression: "*/10 * * * * *",
    enrichmentEnabled: true,
  };
  const enrichmentConfigService = {
    getConfig: async () => enrichmentConfig,
  };

  let evaluateImpl: (title: string) => Promise<EvaluateResult> = async () => ({
    configVersion: "v1",
    reason: "tech_signal:desenvolvedor",
    result: "ENRICH",
  });
  const semanticFilterService = {
    evaluate: async (title: string) => evaluateImpl(title),
  };

  let enrichImpl: (input: {
    department: string | null;
    descriptionClean: string;
    title: string;
  }) => Promise<JobEnrichmentLlmResult> = async () => {
    throw new Error("enrich not configured for this test");
  };
  let enrichCalls = 0;

  const worker = new JobEnrichmentWorker(
    database as never,
    semanticFilterService as never,
    lockRepository as never,
    enrichmentConfigService as never,
    undefined,
    {
      enrich: async (input) => {
        enrichCalls += 1;
        return enrichImpl(input);
      },
      maxAttempts: 3,
    },
  );

  function seedEnrichment(overrides: Partial<EnrichmentRecord> = {}) {
    const id = overrides.id ?? `enrichment-${enrichments.size + 1}`;
    const jobId = overrides.jobId ?? `job-${id}`;
    const record: EnrichmentRecord = {
      attempts: 0,
      createdAt: new Date(),
      enrichmentError: null,
      enrichmentStatus: "PENDING",
      id,
      jobId,
      semanticFilterReason: null,
      semanticFilterResult: "PENDING",
      semanticFilterVersion: null,
      ...overrides,
    };
    enrichments.set(id, record);
    jobs.set(jobId, {
      descriptionClean: "Descricao da vaga",
      metadataJson: { department: "Tecnologia" },
      normalizedTitle: "desenvolvedor backend",
      title: "Desenvolvedor Backend",
    });
    return record;
  }

  return {
    enrichments,
    getEnrichCalls: () => enrichCalls,
    lockRepository,
    seedEnrichment,
    setEnrich(impl: typeof enrichImpl) {
      enrichImpl = impl;
    },
    setEnrichmentConfig(overrides: Partial<typeof enrichmentConfig>) {
      enrichmentConfig = { ...enrichmentConfig, ...overrides };
    },
    setEvaluate(impl: typeof evaluateImpl) {
      evaluateImpl = impl;
    },
    worker,
  };
}

function fullResult(
  overrides: Partial<JobEnrichmentLlmResult> = {},
): JobEnrichmentLlmResult {
  return {
    areas: ["SOFTWARE_ENGINEERING"],
    careerFingerprint: ["Engenheiro Backend"],
    certifications: [],
    contractType: "CLT",
    dominantArea: "SOFTWARE_ENGINEERING",
    experienceYearsMin: 3,
    languageRequirements: [],
    managementRequired: false,
    optionalSkills: [],
    requiredSkills: ["java"],
    seniority: "SENIOR",
    specialties: ["backend"],
    technologies: ["java"],
    travelRequired: false,
    ...overrides,
  };
}

test("JobEnrichmentWorker skips LLM call when semantic filter returns SKIP", async () => {
  const fixture = createFixture();
  fixture.setEvaluate(async () => ({
    configVersion: "v1",
    reason: "noise_signal:enfermeiro",
    result: "SKIP",
  }));
  fixture.seedEnrichment();

  await fixture.worker.processPendingBatch();

  assert.equal(fixture.getEnrichCalls(), 0);
  const [record] = fixture.enrichments.values();
  assert.equal(record.enrichmentStatus, "SKIPPED");
  assert.equal(record.semanticFilterResult, "SKIP");
  assert.equal(record.semanticFilterReason, "noise_signal:enfermeiro");
});

test("JobEnrichmentWorker calls LLM and persists fields when semantic filter returns ENRICH", async () => {
  const fixture = createFixture();
  fixture.setEnrich(async () => fullResult());
  fixture.seedEnrichment();

  await fixture.worker.processPendingBatch();

  assert.equal(fixture.getEnrichCalls(), 1);
  const [record] = fixture.enrichments.values();
  assert.equal(record.enrichmentStatus, "COMPLETED");
  assert.equal(record.semanticFilterResult, "ENRICH");
  assert.equal(record.dominantArea, "SOFTWARE_ENGINEERING");
  assert.deepEqual(record.requiredSkills, ["java"]);
  assert.ok(record.enrichedAt);
  assert.ok(record.enrichmentModel);
  assert.ok(record.enrichmentVersion);
});

test("JobEnrichmentWorker increments attempts on LLM failure and keeps PENDING below max attempts", async () => {
  const fixture = createFixture();
  fixture.setEnrich(async () => {
    throw new Error("openrouter timeout");
  });
  fixture.seedEnrichment({ attempts: 0 });

  await fixture.worker.processPendingBatch();

  const [record] = fixture.enrichments.values();
  assert.equal(record.attempts, 1);
  assert.equal(record.enrichmentStatus, "PENDING");
  assert.equal(record.enrichmentError, "openrouter timeout");
});

test("JobEnrichmentWorker marks FAILED once attempts reach the max", async () => {
  const fixture = createFixture();
  fixture.setEnrich(async () => {
    throw new Error("openrouter timeout");
  });
  fixture.seedEnrichment({ attempts: 2 });

  await fixture.worker.processPendingBatch();

  const [record] = fixture.enrichments.values();
  assert.equal(record.attempts, 3);
  assert.equal(record.enrichmentStatus, "FAILED");
  assert.equal(record.enrichmentError, "openrouter timeout");
});

test("JobEnrichmentWorker marks COMPLETED for dominantArea OTHER", async () => {
  const fixture = createFixture();
  fixture.setEnrich(async () =>
    fullResult({
      areas: [],
      careerFingerprint: [],
      contractType: null,
      dominantArea: "OTHER",
      experienceYearsMin: null,
      requiredSkills: [],
      seniority: null,
      specialties: [],
      technologies: [],
    }),
  );
  fixture.seedEnrichment();

  await fixture.worker.processPendingBatch();

  const [record] = fixture.enrichments.values();
  assert.equal(record.enrichmentStatus, "COMPLETED");
  assert.equal(record.dominantArea, "OTHER");
});

test("JobEnrichmentWorker.runScheduledCycle skips processing when enrichmentEnabled is false", async () => {
  const fixture = createFixture();
  fixture.setEnrichmentConfig({ enrichmentEnabled: false });
  fixture.setEnrich(async () => fullResult());
  fixture.seedEnrichment();

  const processed = await fixture.worker.runScheduledCycle(new Date());

  assert.equal(processed, 0);
  assert.equal(fixture.getEnrichCalls(), 0);
  const [record] = fixture.enrichments.values();
  assert.equal(record.enrichmentStatus, "PENDING");
});

test("JobEnrichmentWorker.runScheduledCycle skips processing when the cron is not due", async () => {
  const fixture = createFixture();
  fixture.setEnrichmentConfig({ enrichmentCronExpression: "30 * * * * *" });
  fixture.setEnrich(async () => fullResult());
  fixture.seedEnrichment();

  const now = new Date("2026-05-17T15:30:20.000Z");
  const processed = await fixture.worker.runScheduledCycle(now);

  assert.equal(processed, 0);
  assert.equal(fixture.getEnrichCalls(), 0);
});

test("JobEnrichmentWorker.runScheduledCycle processes when enabled and the cron is due", async () => {
  const fixture = createFixture();
  fixture.setEnrichmentConfig({ enrichmentCronExpression: "*/10 * * * * *" });
  fixture.setEnrich(async () => fullResult());
  fixture.seedEnrichment();

  const now = new Date("2026-05-17T15:30:20.000Z");
  const processed = await fixture.worker.runScheduledCycle(now);

  assert.equal(processed, 1);
  const [record] = fixture.enrichments.values();
  assert.equal(record.enrichmentStatus, "COMPLETED");
});

test("JobEnrichmentWorker.runNow processes pending jobs even when enrichmentEnabled is false", async () => {
  const fixture = createFixture();
  fixture.setEnrichmentConfig({ enrichmentEnabled: false });
  fixture.setEnrich(async () => fullResult());
  fixture.seedEnrichment();

  const processed = await fixture.worker.runNow();

  assert.equal(processed, 1);
  assert.equal(fixture.getEnrichCalls(), 1);
  const [record] = fixture.enrichments.values();
  assert.equal(record.enrichmentStatus, "COMPLETED");
});

test("JobEnrichmentWorker.processPendingBatch respects enrichmentBatchSize from config", async () => {
  const fixture = createFixture();
  fixture.setEnrichmentConfig({ enrichmentBatchSize: 1 });
  fixture.setEnrich(async () => fullResult());
  fixture.seedEnrichment({ id: "enrichment-a" });
  fixture.seedEnrichment({ id: "enrichment-b" });

  const processed = await fixture.worker.processPendingBatch();

  assert.equal(processed, 1);
  assert.equal(fixture.getEnrichCalls(), 1);
});

test("JobEnrichmentWorker.processOne processes the targeted job regardless of queue order", async () => {
  const fixture = createFixture();
  fixture.setEnrichmentConfig({ enrichmentBatchSize: 1 });
  fixture.setEnrich(async () => fullResult());
  // "older" ficaria na frente de um processPendingBatch com batchSize 1 —
  // processOne deve pegar "newer" mesmo assim, por ser o id pedido.
  fixture.seedEnrichment({
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    id: "older",
  });
  fixture.seedEnrichment({
    createdAt: new Date("2026-06-01T00:00:00.000Z"),
    id: "newer",
  });

  const result = await fixture.worker.processOne("newer");

  assert.deepEqual(result, { processed: true });
  assert.equal(fixture.getEnrichCalls(), 1);
  assert.equal(fixture.enrichments.get("newer")?.enrichmentStatus, "COMPLETED");
  assert.equal(fixture.enrichments.get("older")?.enrichmentStatus, "PENDING");
});

test("JobEnrichmentWorker.processOne returns processed:false for an unknown id", async () => {
  const fixture = createFixture();
  fixture.setEnrich(async () => fullResult());

  const result = await fixture.worker.processOne("does-not-exist");

  assert.deepEqual(result, { processed: false });
  assert.equal(fixture.getEnrichCalls(), 0);
});

test("JobEnrichmentWorker.processOne retries the lock and eventually succeeds once it frees up", async () => {
  const fixture = createFixture();
  fixture.setEnrich(async () => fullResult());
  fixture.seedEnrichment({ id: "job-1" });

  let attempts = 0;
  fixture.lockRepository.acquire = async () => {
    attempts += 1;
    return attempts >= 3;
  };

  const result = await fixture.worker.processOne("job-1");

  assert.deepEqual(result, { processed: true });
  assert.equal(attempts, 3);
  assert.equal(fixture.enrichments.get("job-1")?.enrichmentStatus, "COMPLETED");
});

test("JobEnrichmentWorker.processOne throws when the lock stays busy after retrying", async () => {
  const fixture = createFixture();
  fixture.setEnrich(async () => fullResult());
  fixture.seedEnrichment({ id: "job-1" });
  fixture.lockRepository.acquire = async () => false;

  await assert.rejects(() => fixture.worker.processOne("job-1"));
  assert.equal(fixture.getEnrichCalls(), 0);
});
