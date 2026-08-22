import assert from "node:assert/strict";
import { test } from "node:test";
import { setTimeout as sleep } from "node:timers/promises";

import { JobApplicationCoverLetterService } from "./cover-letter.service";

const CoverLetterServiceCtor =
  JobApplicationCoverLetterService as unknown as new (
    db: unknown,
    ai: unknown,
    funnelEvents: unknown,
    pdf?: unknown,
    docx?: unknown,
  ) => JobApplicationCoverLetterService;

const STUB_CONTENT = {
  body: "Prezados, escrevo para...",
  characterCount: 30,
};

function makeAiMock() {
  return { generate: async () => STUB_CONTENT };
}

function makeApp(overrides: Record<string, unknown> = {}) {
  return {
    id: "app-1",
    userId: "user-1",
    jobTitle: "Engenheiro de Software",
    companyName: "Acme Corp",
    language: "pt-BR",
    currentCvAdaptationId: "cv-1",
    coverLetter: null,
    cvAdaptations: [
      {
        id: "cv-1",
        status: "delivered",
        isUnlocked: true,
        language: "pt-BR",
        adaptedContentJson: null,
        aiAuditJson: null,
        editedCvJson: null,
      },
    ],
    ...overrides,
  };
}

function makeDb(app: ReturnType<typeof makeApp> | null = makeApp()) {
  const createdEvents: unknown[] = [];
  let letterRecord: Record<string, unknown> | null = null;

  const db = {
    jobApplication: {
      findFirst: async () => app,
    },
    jobApplicationCoverLetter: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        letterRecord = { id: "letter-1", status: "pending", ...data };
        return letterRecord;
      },
      update: async ({ data }: { data: Record<string, unknown> }) => {
        letterRecord = { ...(letterRecord ?? { id: "letter-1" }), ...data };
        return letterRecord;
      },
    },
    jobApplicationEvent: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        createdEvents.push(data);
        return data;
      },
    },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(db),
    _createdEvents: createdEvents,
  };

  return db;
}

function makeFunnelEventsCapture() {
  const calls: Array<{
    eventName: string;
    idempotencyKey?: string;
    metadata?: Record<string, unknown>;
  }> = [];
  return {
    funnelEvents: {
      record: async (input: {
        eventName: string;
        idempotencyKey?: string;
        metadata?: Record<string, unknown>;
      }) => {
        calls.push(input);
        return { event: {}, ingested: true };
      },
    },
    calls,
  };
}

test("cover_letter_generated carries sessionInternalId in metadata when the caller passes a journey session id", async () => {
  const db = makeDb(makeApp());
  const { funnelEvents, calls } = makeFunnelEventsCapture();
  const service = new CoverLetterServiceCtor(db, makeAiMock(), funnelEvents);

  await service.generateOrGet(
    "user-1",
    "app-1",
    { style: "formal", lengthMode: "short" } as never,
    "journey-cover-1",
  );
  await sleep(20);

  const generated = calls.find((c) => c.eventName === "cover_letter_generated");
  assert.equal(generated?.metadata?.sessionInternalId, "journey-cover-1");
});

test("cover_letter_generated omits sessionInternalId from metadata when the caller has no reliable journey context — never invented", async () => {
  const db = makeDb(makeApp());
  const { funnelEvents, calls } = makeFunnelEventsCapture();
  const service = new CoverLetterServiceCtor(db, makeAiMock(), funnelEvents);

  await service.generateOrGet("user-1", "app-1", {
    style: "formal",
    lengthMode: "short",
  } as never);
  await sleep(20);

  const generated = calls.find((c) => c.eventName === "cover_letter_generated");
  assert.equal("sessionInternalId" in (generated?.metadata ?? {}), false);
});

test("cover_letter_generated uses a stable idempotencyKey scoped to the letter id", async () => {
  const db = makeDb(makeApp());
  const { funnelEvents, calls } = makeFunnelEventsCapture();
  const service = new CoverLetterServiceCtor(db, makeAiMock(), funnelEvents);

  await service.generateOrGet("user-1", "app-1", {
    style: "formal",
    lengthMode: "short",
  } as never);
  await sleep(20);

  const generated = calls.find((c) => c.eventName === "cover_letter_generated");
  assert.equal(generated?.idempotencyKey, "cover_letter_generated:letter-1");
});
