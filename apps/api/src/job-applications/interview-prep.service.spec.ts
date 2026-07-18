import assert from "node:assert/strict";
import { test } from "node:test";
import { setTimeout as sleep } from "node:timers/promises";

import { JobApplicationInterviewPrepService } from "./interview-prep.service";

const InterviewPrepServiceCtor =
  JobApplicationInterviewPrepService as unknown as new (
    db: unknown,
    ai: unknown,
    funnelEvents: unknown,
  ) => JobApplicationInterviewPrepService;

const STUB_CONTENT = {
  strategySummary: "Prepare-se bem.",
  strengthsToHighlight: ["Ponto A"],
  likelyRisksOrGaps: ["Gap X"],
  questionsTheyMayAsk: [
    {
      question: "Por que?",
      whyItMatters: "Motivo.",
      answerDirection: "Direcao.",
    },
  ],
  questionsCandidateShouldAsk: ["O que esperam?"],
  recommendedPosture: ["Seja direto"],
  finalChecklist: ["Pesquise a empresa"],
};

function makeAiMock(calls: unknown[] = []) {
  return {
    generate: async (ctx: unknown) => {
      calls.push(ctx);
      return STUB_CONTENT;
    },
  };
}

function makeFunnelEventsMock() {
  return {
    record: async () => undefined,
  };
}

function makeApp(overrides: Record<string, unknown> = {}) {
  return {
    id: "app-1",
    userId: "user-1",
    jobTitle: "Engenheiro de Software",
    companyName: "Acme Corp",
    location: "São Paulo, SP",
    jobUrl: "https://example.com/vaga",
    jobDescriptionText: "Vaga para dev backend com Node.js.",
    status: "INTERVIEW",
    scoreBefore: 60,
    scoreAfter: 82,
    currentCvAdaptationId: "cv-1",
    interviewPrep: null,
    cvAdaptations: [
      {
        id: "cv-1",
        status: "delivered",
        isUnlocked: true,
        jobDescriptionText: "Vaga para dev backend com Node.js.",
        adaptedContentJson: null,
      },
    ],
    ...overrides,
  };
}

function makeDb(app: ReturnType<typeof makeApp> | null = makeApp()) {
  const createdPreps: Record<string, unknown>[] = [];
  const updatedPreps: Record<string, unknown>[] = [];
  const createdEvents: unknown[] = [];
  let prepRecord: Record<string, unknown> | null = null;

  const db = {
    jobApplication: {
      findFirst: async () => app,
      findMany: async () => [],
      update: async () => ({}),
    },
    jobApplicationInterviewPrep: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        prepRecord = {
          id: "prep-1",
          createdAt: new Date(),
          updatedAt: new Date(),
          generatedContentJson: null,
          generatedAt: null,
          startedAt: null,
          finishedAt: null,
          lastError: null,
          ...data,
        };
        createdPreps.push(prepRecord);
        return prepRecord;
      },
      update: async ({
        data,
      }: {
        where: { id: string };
        data: Record<string, unknown>;
      }) => {
        prepRecord = { ...(prepRecord ?? { id: "prep-1" }), ...data };
        updatedPreps.push(prepRecord);
        return prepRecord;
      },
    },
    jobApplicationEvent: {
      create: async ({ data }: { data: unknown }) => {
        createdEvents.push(data);
        return { id: "evt-1", ...(data as Record<string, unknown>) };
      },
    },
    $transaction: async <T>(fn: (tx: typeof db) => Promise<T>): Promise<T> => {
      return fn(db);
    },
    _createdPreps: createdPreps,
    _updatedPreps: updatedPreps,
    _createdEvents: createdEvents,
  };

  return db;
}

// ─── ownership ────────────────────────────────────────────────────────────────

test("throws NotFoundException when application not found for userId", async () => {
  const db = makeDb(null);
  const aiCalls: unknown[] = [];
  const service = new InterviewPrepServiceCtor(
    db,
    makeAiMock(aiCalls),
    makeFunnelEventsMock(),
  );

  await assert.rejects(
    () => service.generateOrGet("wrong-user", "app-1"),
    (err: Error) => {
      assert.match(err.message, /not found/i);
      return true;
    },
  );
  assert.equal(aiCalls.length, 0);
});

// ─── idempotency ──────────────────────────────────────────────────────────────

test("returns existing interviewPrep without calling AI when succeeded", async () => {
  const existingPrep = {
    id: "prep-existing",
    jobApplicationId: "app-1",
    status: "succeeded",
    generatedContentJson: STUB_CONTENT,
    generatedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const db = makeDb(makeApp({ interviewPrep: existingPrep }));
  const aiCalls: unknown[] = [];
  const service = new InterviewPrepServiceCtor(
    db,
    makeAiMock(aiCalls),
    makeFunnelEventsMock(),
  );

  const result = await service.generateOrGet("user-1", "app-1");

  assert.equal(aiCalls.length, 0, "AI should not be called when prep exists");
  assert.equal((result as typeof existingPrep).id, "prep-existing");
});

test("returns existing pending interviewPrep as-is (client keeps polling)", async () => {
  const existingPrep = {
    id: "prep-existing",
    jobApplicationId: "app-1",
    status: "pending",
    generatedContentJson: null,
    generatedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const db = makeDb(makeApp({ interviewPrep: existingPrep }));
  const aiCalls: unknown[] = [];
  const service = new InterviewPrepServiceCtor(
    db,
    makeAiMock(aiCalls),
    makeFunnelEventsMock(),
  );

  const result = await service.generateOrGet("user-1", "app-1");

  assert.equal(aiCalls.length, 0);
  assert.equal((result as typeof existingPrep).status, "pending");
});

test("rejects when application has no selected CV", async () => {
  const db = makeDb(makeApp({ currentCvAdaptationId: null }));
  const aiCalls: unknown[] = [];
  const service = new InterviewPrepServiceCtor(
    db,
    makeAiMock(aiCalls),
    makeFunnelEventsMock(),
  );

  await assert.rejects(
    () => service.generateOrGet("user-1", "app-1"),
    /Defina o CV desta candidatura antes de preparar sua entrevista/i,
  );
  assert.equal(aiCalls.length, 0);
});

test("rejects when selected CV is not unlocked", async () => {
  const db = makeDb(
    makeApp({
      currentCvAdaptationId: "cv-1",
      cvAdaptations: [
        {
          id: "cv-1",
          status: "awaiting_payment",
          isUnlocked: false,
          jobDescriptionText: "Vaga para dev backend com Node.js.",
          adaptedContentJson: {},
        },
        {
          id: "cv-2",
          status: "delivered",
          isUnlocked: true,
          jobDescriptionText: "Outra vaga",
          adaptedContentJson: {
            pontos_fortes: ["Experiência com APIs"],
          },
        },
      ],
    }),
  );
  const aiCalls: unknown[] = [];
  const service = new InterviewPrepServiceCtor(
    db,
    makeAiMock(aiCalls),
    makeFunnelEventsMock(),
  );

  await assert.rejects(
    () => service.generateOrGet("user-1", "app-1"),
    /Libere o CV desta vaga para preparar sua entrevista/i,
  );
  assert.equal(aiCalls.length, 0);
});

// ─── generation (async) ─────────────────────────────────────────────────────────

test("returns immediately with a pending prep and generates in the background", async () => {
  const db = makeDb(makeApp());
  const aiCalls: unknown[] = [];
  const service = new InterviewPrepServiceCtor(
    db,
    makeAiMock(aiCalls),
    makeFunnelEventsMock(),
  );

  const started = await service.generateOrGet("user-1", "app-1");

  // "pending" na hora — a análise roda em background, sem segurar o request.
  assert.equal((started as { status: string }).status, "pending");
  assert.equal(db._createdPreps.length, 1);

  await sleep(20);

  assert.equal(aiCalls.length, 1, "AI must be called exactly once");
  const statuses = (db._updatedPreps as Array<{ status: string }>).map(
    (u) => u.status,
  );
  assert.deepEqual(statuses, ["processing", "succeeded"]);
});

test("creates INTERVIEW_PREP_GENERATED event after background generation", async () => {
  const db = makeDb(makeApp());
  const service = new InterviewPrepServiceCtor(
    db,
    makeAiMock(),
    makeFunnelEventsMock(),
  );

  await service.generateOrGet("user-1", "app-1");
  await sleep(20);

  const events = db._createdEvents as Array<Record<string, unknown>>;
  const prepEvent = events.find(
    (e) => e.eventType === "INTERVIEW_PREP_GENERATED",
  );
  assert.ok(prepEvent, "INTERVIEW_PREP_GENERATED event must be created");
  assert.equal(prepEvent.jobApplicationId, "app-1");
});

test("persists generatedContentJson once generation succeeds", async () => {
  const db = makeDb(makeApp());
  const service = new InterviewPrepServiceCtor(
    db,
    makeAiMock(),
    makeFunnelEventsMock(),
  );

  await service.generateOrGet("user-1", "app-1");
  await sleep(20);

  const finalUpdate = (
    db._updatedPreps as Array<Record<string, unknown>>
  ).at(-1);
  assert.equal(finalUpdate?.status, "succeeded");
  assert.deepEqual(finalUpdate?.generatedContentJson, STUB_CONTENT);
});

// ─── context building ─────────────────────────────────────────────────────────

test("passes jobDescriptionText to AI when available on application", async () => {
  const db = makeDb(
    makeApp({ jobDescriptionText: "Descrição completa da vaga." }),
  );
  const aiCalls: Array<Record<string, unknown>> = [];
  const service = new InterviewPrepServiceCtor(
    db,
    makeAiMock(aiCalls),
    makeFunnelEventsMock(),
  );

  await service.generateOrGet("user-1", "app-1");
  await sleep(20);

  assert.equal(
    aiCalls[0].jobDescriptionText,
    "Descrição completa da vaga.",
    "jobDescriptionText must be passed to AI",
  );
  const event = (db._createdEvents as Array<Record<string, unknown>>).find(
    (e) => e.eventType === "INTERVIEW_PREP_GENERATED",
  );
  assert.equal(
    (event?.metadata as Record<string, unknown>).usedJobDescription,
    true,
  );
});

test("generates without jobDescriptionText using fallback", async () => {
  const db = makeDb(
    makeApp({
      jobDescriptionText: null,
      cvAdaptations: [
        {
          id: "cv-1",
          status: "delivered",
          isUnlocked: true,
          jobDescriptionText: null,
          adaptedContentJson: null,
        },
      ],
    }),
  );
  const aiCalls: Array<Record<string, unknown>> = [];
  const service = new InterviewPrepServiceCtor(
    db,
    makeAiMock(aiCalls),
    makeFunnelEventsMock(),
  );

  await service.generateOrGet("user-1", "app-1");
  await sleep(20);

  assert.equal(aiCalls[0].jobDescriptionText, null);
  const event = (db._createdEvents as Array<Record<string, unknown>>).find(
    (e) => e.eventType === "INTERVIEW_PREP_GENERATED",
  );
  assert.equal(
    (event?.metadata as Record<string, unknown>).usedJobDescription,
    false,
  );
});

test("uses adaptedContentJson from CvAdaptation as structured context", async () => {
  const adaptedContentJson = {
    pontos_fortes: ["Forte em Node.js", "Experiência com microsserviços"],
    lacunas: ["Pouca experiência com Go"],
    melhorias_aplicadas: ["Palavras-chave de backend adicionadas"],
    fit: { headline: "CV bem alinhado à vaga" },
  };

  const app = makeApp({
    jobDescriptionText: null,
    currentCvAdaptationId: "cv-1",
    cvAdaptations: [
      {
        id: "cv-1",
        status: "delivered",
        isUnlocked: true,
        jobDescriptionText: "Vaga para dev com Go e Node.",
        adaptedContentJson,
      },
    ],
  });

  const db = makeDb(app);
  const aiCalls: Array<Record<string, unknown>> = [];
  const service = new InterviewPrepServiceCtor(
    db,
    makeAiMock(aiCalls),
    makeFunnelEventsMock(),
  );

  await service.generateOrGet("user-1", "app-1");
  await sleep(20);

  const ctx = aiCalls[0] as { structuredAnalysis: Record<string, unknown> };
  assert.ok(ctx.structuredAnalysis, "structuredAnalysis must be passed to AI");
  assert.deepEqual(ctx.structuredAnalysis.pontosFortes, [
    "Forte em Node.js",
    "Experiência com microsserviços",
  ]);
  assert.deepEqual(ctx.structuredAnalysis.lacunas, [
    "Pouca experiência com Go",
  ]);

  const event = (db._createdEvents as Array<Record<string, unknown>>).find(
    (e) => e.eventType === "INTERVIEW_PREP_GENERATED",
  );
  assert.equal(
    (event?.metadata as Record<string, unknown>).usedStructuredData,
    true,
  );
});

test("uses the selected CV even when another unlocked adaptation is more recent", async () => {
  const selectedAdaptedContentJson = {
    pontos_fortes: ["Foco em TypeScript"],
  };
  const latestAdaptedContentJson = {
    pontos_fortes: ["Foco em Python"],
  };

  const db = makeDb(
    makeApp({
      currentCvAdaptationId: "cv-selected",
      jobDescriptionText: null,
      cvAdaptations: [
        {
          id: "cv-latest",
          status: "delivered",
          isUnlocked: true,
          jobDescriptionText: "Vaga recente",
          adaptedContentJson: latestAdaptedContentJson,
        },
        {
          id: "cv-selected",
          status: "delivered",
          isUnlocked: true,
          jobDescriptionText: "Vaga escolhida",
          adaptedContentJson: selectedAdaptedContentJson,
        },
      ],
    }),
  );
  const aiCalls: Array<Record<string, unknown>> = [];
  const service = new InterviewPrepServiceCtor(
    db,
    makeAiMock(aiCalls),
    makeFunnelEventsMock(),
  );

  await service.generateOrGet("user-1", "app-1");
  await sleep(20);

  assert.equal(aiCalls[0].jobDescriptionText, "Vaga escolhida");
  assert.deepEqual(aiCalls[0].structuredAnalysis, {
    pontosFortes: ["Foco em TypeScript"],
    lacunas: [],
    melhoriasAplicadas: [],
    fitHeadline: "",
  });
});

test("does not pass jobUrl to AI context (no scraping)", async () => {
  const db = makeDb(makeApp({ jobUrl: "https://jobs.example.com/12345" }));
  const aiCalls: Array<Record<string, unknown>> = [];
  const service = new InterviewPrepServiceCtor(db, makeAiMock(aiCalls));

  await service.generateOrGet("user-1", "app-1");
  await sleep(20);

  assert.ok(
    !("jobUrl" in (aiCalls[0] as object)),
    "jobUrl must NOT be passed to AI",
  );
});

// ─── failure isolation ────────────────────────────────────────────────────────

test("marks prep as failed without throwing out of generateOrGet", async () => {
  const db = makeDb(makeApp());
  const failingAi = {
    generate: async () => {
      throw new Error("AI timeout");
    },
  };

  const service = new InterviewPrepServiceCtor(
    db,
    failingAi,
    makeFunnelEventsMock(),
  );

  const started = await service.generateOrGet("user-1", "app-1");
  assert.equal((started as { status: string }).status, "pending");

  await sleep(20);

  const finalUpdate = (
    db._updatedPreps as Array<Record<string, unknown>>
  ).at(-1);
  assert.equal(finalUpdate?.status, "failed");
  assert.match(String(finalUpdate?.lastError), /AI timeout/);
  assert.equal(
    db._createdEvents.length,
    0,
    "no event must be created on failure",
  );
});

test("retries generation on the next call after a failure", async () => {
  const failedPrep = {
    id: "prep-existing",
    jobApplicationId: "app-1",
    status: "failed",
    lastError: "AI timeout",
    generatedContentJson: null,
    generatedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const db = makeDb(makeApp({ interviewPrep: failedPrep }));
  const aiCalls: unknown[] = [];
  const service = new InterviewPrepServiceCtor(
    db,
    makeAiMock(aiCalls),
    makeFunnelEventsMock(),
  );

  const started = await service.generateOrGet("user-1", "app-1");
  assert.equal((started as { status: string }).status, "pending");
  assert.equal(
    db._createdPreps.length,
    0,
    "must reuse the existing row, not create a new one",
  );

  await sleep(20);

  assert.equal(aiCalls.length, 1);
  const finalUpdate = (
    db._updatedPreps as Array<Record<string, unknown>>
  ).at(-1);
  assert.equal(finalUpdate?.status, "succeeded");
});

test("propagates validation error without leaving partial state", async () => {
  const db = makeDb(makeApp());
  const emptyAi = {
    generate: async () => {
      throw new Error("InterviewPrep validation failed: content is empty");
    },
  };

  const service = new InterviewPrepServiceCtor(
    db,
    emptyAi,
    makeFunnelEventsMock(),
  );

  await service.generateOrGet("user-1", "app-1");
  await sleep(20);

  const finalUpdate = (
    db._updatedPreps as Array<Record<string, unknown>>
  ).at(-1);
  assert.equal(finalUpdate?.status, "failed");
  assert.match(String(finalUpdate?.lastError), /validation failed/i);
  assert.equal(
    db._createdEvents.length,
    0,
    "no event must be created on validation failure",
  );
});

// ─── isolation from existing analysis methods ─────────────────────────────────

test("existing CvAdaptationAiService methods are not called by InterviewPrepService", async () => {
  const db = makeDb(makeApp());
  const aiCalls: unknown[] = [];

  // The AI service passed only has `generate` — no analyzeAndAdapt or buildPaidCvOutputFromGuest
  const service = new InterviewPrepServiceCtor(
    db,
    makeAiMock(aiCalls),
    makeFunnelEventsMock(),
  );

  await service.generateOrGet("user-1", "app-1");
  await sleep(20);

  // Just asserting the service ran successfully without any cross-contamination
  assert.equal(aiCalls.length, 1);
});
