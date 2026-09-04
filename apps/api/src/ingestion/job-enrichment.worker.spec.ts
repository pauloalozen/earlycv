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
  updatedAt: Date;
} & Partial<JobEnrichmentLlmResult> & {
    enrichedAt?: Date | null;
    enrichmentModel?: string | null;
    enrichmentVersion?: string | null;
  };

type JobRecord = {
  descriptionClean: string;
  metadataJson: unknown;
  normalizedTitle: string;
  slug: string | null;
  status: string;
  title: string;
};

type EvaluateResult = {
  configVersion: string;
  reason: string;
  result: "ENRICH" | "SKIP";
};

type BatchRunRecord = {
  id: string;
  status: string;
  triggeredBy: string;
  batchSize: number;
  processedCount: number;
  cancelRequestedAt: Date | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  errorMessage: string | null;
  createdAt: Date;
};

function createFixture() {
  const enrichments = new Map<string, EnrichmentRecord>();
  const jobs = new Map<string, JobRecord>();
  const batchRuns = new Map<string, BatchRunRecord>();
  let nextBatchRunId = 1;
  const monitorMatchJobUpserts: string[] = [];
  let monitorMatchJobUpsertShouldThrow = false;

  const database = {
    enrichmentBatchRun: {
      create: async ({ data }: { data: Partial<BatchRunRecord> }) => {
        const id = `batch-run-${nextBatchRunId++}`;
        const record: BatchRunRecord = {
          batchSize: 0,
          cancelRequestedAt: null,
          createdAt: new Date(),
          errorMessage: null,
          finishedAt: null,
          id,
          processedCount: 0,
          startedAt: null,
          status: "QUEUED",
          triggeredBy: "SCHEDULE",
          ...data,
        };
        batchRuns.set(id, record);
        return record;
      },
      findFirst: async ({ where }: { where: { status: { in: string[] } } }) =>
        Array.from(batchRuns.values())
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
          .find((run) => where.status.in.includes(run.status)) ?? null,
      findMany: async ({ take }: { take?: number } = {}) =>
        Array.from(batchRuns.values())
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
          .slice(0, take),
      findUnique: async ({ where }: { where: { id: string } }) =>
        batchRuns.get(where.id) ?? null,
      update: async ({
        data,
        where,
      }: {
        data: Partial<BatchRunRecord> & {
          processedCount?: { increment: number };
        };
        where: { id: string };
      }) => {
        const current = batchRuns.get(where.id);
        assert.ok(current, `batch run ${where.id} must exist`);
        const processedCount =
          typeof data.processedCount === "object"
            ? current.processedCount + data.processedCount.increment
            : (data.processedCount ?? current.processedCount);
        const next = { ...current, ...data, processedCount };
        batchRuns.set(where.id, next);
        return next;
      },
    },
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
        const next = { ...current, ...data, updatedAt: new Date() };
        enrichments.set(where.id, next);
        return next;
      },
    },
    monitorMatchJob: {
      upsert: async ({ where }: { where: { jobId: string } }) => {
        if (monitorMatchJobUpsertShouldThrow) {
          throw new Error("monitor match job upsert failed");
        }
        monitorMatchJobUpserts.push(where.jobId);
        return { id: `monitor-match-${where.jobId}`, jobId: where.jobId };
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

  const indexingCalls: string[] = [];
  const googleIndexingService = {
    notifyIndexing: async (slug: string) => {
      indexingCalls.push(slug);
    },
    notifyRemoval: async () => {},
  };

  const worker = new JobEnrichmentWorker(
    database as never,
    semanticFilterService as never,
    lockRepository as never,
    enrichmentConfigService as never,
    googleIndexingService as never,
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
      updatedAt: new Date(),
      ...overrides,
    };
    enrichments.set(id, record);
    jobs.set(jobId, {
      descriptionClean: "Descricao da vaga",
      metadataJson: { department: "Tecnologia" },
      normalizedTitle: "desenvolvedor backend",
      slug: `${jobId}-slug`,
      status: "active",
      title: "Desenvolvedor Backend",
    });
    return record;
  }

  return {
    batchRuns,
    enrichments,
    getEnrichCalls: () => enrichCalls,
    getIndexingCalls: () => indexingCalls,
    getMonitorMatchJobUpserts: () => monitorMatchJobUpserts,
    setMonitorMatchJobUpsertShouldThrow(value: boolean) {
      monitorMatchJobUpsertShouldThrow = value;
    },
    jobs,
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

test("JobEnrichmentWorker skips enrichment (and never calls the semantic filter or LLM) when the job's description is empty — a failed capture", async () => {
  const fixture = createFixture();
  const record = fixture.seedEnrichment();
  fixture.jobs.set(record.jobId, {
    descriptionClean: "",
    metadataJson: { department: "Tecnologia" },
    normalizedTitle: "desenvolvedor backend",
    title: "Desenvolvedor Backend",
    slug: `${record.jobId}-slug`,
    status: "active",
  });
  fixture.setEvaluate(async () => {
    throw new Error(
      "semantic filter should not be called for empty description",
    );
  });

  await fixture.worker.processPendingBatch();

  assert.equal(fixture.getEnrichCalls(), 0);
  const [updated] = fixture.enrichments.values();
  assert.equal(updated.enrichmentStatus, "SKIPPED");
  assert.equal(updated.semanticFilterResult, "SKIP");
  assert.equal(updated.semanticFilterReason, "empty_description");
});

test("JobEnrichmentWorker skips enrichment when the job's title is empty — a failed capture", async () => {
  const fixture = createFixture();
  const record = fixture.seedEnrichment();
  fixture.jobs.set(record.jobId, {
    descriptionClean: "Descricao da vaga",
    metadataJson: { department: "Tecnologia" },
    normalizedTitle: "",
    title: "",
    slug: `${record.jobId}-slug`,
    status: "active",
  });
  fixture.setEvaluate(async () => {
    throw new Error("semantic filter should not be called for empty title");
  });

  await fixture.worker.processPendingBatch();

  assert.equal(fixture.getEnrichCalls(), 0);
  const [updated] = fixture.enrichments.values();
  assert.equal(updated.enrichmentStatus, "SKIPPED");
  assert.equal(updated.semanticFilterResult, "SKIP");
  assert.equal(updated.semanticFilterReason, "empty_title");
});

test("JobEnrichmentWorker skips enrichment even with force:true when the description is empty — nothing real to enrich", async () => {
  const fixture = createFixture();
  const record = fixture.seedEnrichment();
  fixture.jobs.set(record.jobId, {
    descriptionClean: "   ",
    metadataJson: { department: "Tecnologia" },
    normalizedTitle: "desenvolvedor backend",
    title: "Desenvolvedor Backend",
    slug: `${record.jobId}-slug`,
    status: "active",
  });

  await fixture.worker.processOne(record.id, { force: true });

  assert.equal(fixture.getEnrichCalls(), 0);
  const updated = fixture.enrichments.get(record.id);
  assert.equal(updated?.enrichmentStatus, "SKIPPED");
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

test("JobEnrichmentWorker notifies Google Indexing API once enrichment completes for an active job", async () => {
  const fixture = createFixture();
  fixture.setEnrich(async () => fullResult());
  const record = fixture.seedEnrichment();

  await fixture.worker.processPendingBatch();

  assert.deepEqual(fixture.getIndexingCalls(), [`${record.jobId}-slug`]);
});

test("JobEnrichmentWorker enqueues a MonitorMatchJob once enrichment completes", async () => {
  const fixture = createFixture();
  fixture.setEnrich(async () => fullResult());
  const record = fixture.seedEnrichment();

  await fixture.worker.processPendingBatch();

  assert.deepEqual(fixture.getMonitorMatchJobUpserts(), [record.jobId]);
});

test("JobEnrichmentWorker still marks enrichment COMPLETED even if enqueuing the MonitorMatchJob fails — the Monitor can never break enrichment", async () => {
  const fixture = createFixture();
  fixture.setEnrich(async () => fullResult());
  fixture.seedEnrichment();
  fixture.setMonitorMatchJobUpsertShouldThrow(true);

  await fixture.worker.processPendingBatch();

  const [record] = fixture.enrichments.values();
  assert.equal(record.enrichmentStatus, "COMPLETED");
  assert.deepEqual(fixture.getMonitorMatchJobUpserts(), []);
});

test("JobEnrichmentWorker does not notify Google Indexing API when the job was inactivated before enrichment finished", async () => {
  const fixture = createFixture();
  fixture.setEnrich(async () => fullResult());
  const record = fixture.seedEnrichment();
  fixture.jobs.set(record.jobId, {
    descriptionClean: "Descricao da vaga",
    metadataJson: { department: "Tecnologia" },
    normalizedTitle: "desenvolvedor backend",
    title: "Desenvolvedor Backend",
    slug: `${record.jobId}-slug`,
    status: "inactive",
  });

  await fixture.worker.processPendingBatch();

  assert.deepEqual(fixture.getIndexingCalls(), []);
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

  const { batchRun, completion } = await fixture.worker.runNow();

  // runNow e fire-and-forget: retorna assim que o batch run e criado, sem
  // esperar o processamento — o teste espera `completion` explicitamente
  // pra poder verificar o resultado final.
  assert.equal(batchRun.triggeredBy, "MANUAL");
  await completion;

  assert.equal(fixture.getEnrichCalls(), 1);
  const [record] = fixture.enrichments.values();
  assert.equal(record.enrichmentStatus, "COMPLETED");
  assert.equal(fixture.batchRuns.get(batchRun.id)?.status, "COMPLETED");
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

test("JobEnrichmentWorker.processPendingBatch cria um EnrichmentBatchRun rastreando o lote", async () => {
  const fixture = createFixture();
  fixture.setEnrich(async () => fullResult());
  fixture.seedEnrichment({ id: "enrichment-a" });
  fixture.seedEnrichment({ id: "enrichment-b" });

  await fixture.worker.processPendingBatch("MANUAL");

  const runs = Array.from(fixture.batchRuns.values());
  assert.equal(runs.length, 1);
  assert.equal(runs[0]?.status, "COMPLETED");
  assert.equal(runs[0]?.triggeredBy, "MANUAL");
  assert.equal(runs[0]?.batchSize, 2);
  assert.equal(runs[0]?.processedCount, 2);
  assert.ok(runs[0]?.startedAt instanceof Date);
  assert.ok(runs[0]?.finishedAt instanceof Date);
});

test("JobEnrichmentWorker.requestCancel para o lote entre um item e o proximo", async () => {
  const fixture = createFixture();
  fixture.seedEnrichment({ id: "enrichment-a" });
  fixture.seedEnrichment({ id: "enrichment-b" });
  fixture.seedEnrichment({ id: "enrichment-c" });

  let callCount = 0;
  fixture.setEnrich(async () => {
    callCount += 1;
    if (callCount === 1) {
      // simula o admin clicando em cancelar enquanto o 1o item processa
      const [run] = Array.from(fixture.batchRuns.values());
      assert.ok(run, "batch run deve existir antes do primeiro item rodar");
      await fixture.worker.requestCancel(run.id);
    }
    return fullResult();
  });

  await fixture.worker.processPendingBatch("MANUAL");

  assert.equal(
    callCount,
    1,
    "loop nao deve seguir pro proximo item apos cancelar",
  );
  const runs = Array.from(fixture.batchRuns.values());
  assert.equal(runs[0]?.status, "CANCELLED");
  assert.equal(runs[0]?.processedCount, 1);
});

test("JobEnrichmentWorker.processPendingBatch com trigger SCHEDULE nao cria EnrichmentBatchRun", async () => {
  const fixture = createFixture();
  fixture.setEnrich(async () => fullResult());
  fixture.seedEnrichment();
  fixture.seedEnrichment();

  const processed = await fixture.worker.processPendingBatch("SCHEDULE");

  assert.equal(processed, 2);
  assert.equal(fixture.getEnrichCalls(), 2);
  assert.equal(
    fixture.batchRuns.size,
    0,
    "tick automatico nao deve gerar log/lote rastreavel",
  );
});

test("JobEnrichmentWorker.processPendingBatch recovers a stale PROCESSING enrichment back to PENDING", async () => {
  const fixture = createFixture();
  fixture.setEnrich(async () => fullResult());
  fixture.seedEnrichment({
    attempts: 0,
    enrichmentStatus: "PROCESSING",
    id: "stuck",
    updatedAt: new Date(Date.now() - 60 * 60_000),
  });

  await fixture.worker.processPendingBatch();

  const record = fixture.enrichments.get("stuck");
  assert.equal(record?.enrichmentStatus, "COMPLETED");
  assert.equal(fixture.getEnrichCalls(), 1);
});

test("JobEnrichmentWorker.processPendingBatch marks a stale PROCESSING enrichment FAILED once attempts are exhausted", async () => {
  const fixture = createFixture();
  fixture.setEnrich(async () => fullResult());
  fixture.seedEnrichment({
    attempts: 2,
    enrichmentStatus: "PROCESSING",
    id: "stuck",
    updatedAt: new Date(Date.now() - 60 * 60_000),
  });

  await fixture.worker.processPendingBatch();

  const record = fixture.enrichments.get("stuck");
  assert.equal(record?.enrichmentStatus, "FAILED");
  assert.equal(record?.attempts, 3);
  assert.equal(fixture.getEnrichCalls(), 0);
});

test("JobEnrichmentWorker.processPendingBatch leaves a recently-updated PROCESSING enrichment untouched", async () => {
  const fixture = createFixture();
  fixture.setEnrich(async () => fullResult());
  fixture.seedEnrichment({
    attempts: 0,
    enrichmentStatus: "PROCESSING",
    id: "in-flight",
    updatedAt: new Date(),
  });

  await fixture.worker.processPendingBatch();

  const record = fixture.enrichments.get("in-flight");
  assert.equal(record?.enrichmentStatus, "PROCESSING");
  assert.equal(fixture.getEnrichCalls(), 0);
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

test("JobEnrichmentWorker.processOne with force:true bypasses the semantic filter SKIP", async () => {
  const fixture = createFixture();
  fixture.setEvaluate(async () => ({
    configVersion: "v1",
    reason: "noise_signal:enfermeiro",
    result: "SKIP",
  }));
  fixture.setEnrich(async () => fullResult());
  fixture.seedEnrichment({ id: "job-1" });

  const result = await fixture.worker.processOne("job-1", { force: true });

  assert.deepEqual(result, { processed: true });
  assert.equal(fixture.getEnrichCalls(), 1);
  const record = fixture.enrichments.get("job-1");
  assert.equal(record?.enrichmentStatus, "COMPLETED");
  assert.equal(record?.semanticFilterResult, "ENRICH");
  assert.equal(record?.semanticFilterReason, "forced_by_admin");
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
