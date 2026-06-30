import assert from "node:assert/strict";
import { test } from "node:test";
import { setImmediate } from "node:timers/promises";

import { ResumesService } from "./resumes.service";

function createFileUpload() {
  return {
    fieldname: "file",
    originalname: "cv.pdf",
    encoding: "7bit",
    mimetype: "application/pdf",
    size: 12,
    buffer: Buffer.from("fake"),
  };
}

test("create waits for master CV extraction and forwards the raw file payload", async () => {
  let resolveExtraction: (() => void) | null = null;
  const enqueueCalls: Array<unknown> = [];

  const extractionPromise = new Promise<void>((resolve) => {
    resolveExtraction = resolve;
  });

  const service = new ResumesService(
    {
      $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          resume: {
            count: async () => 0,
            updateMany: async () => ({ count: 0 }),
            create: async ({ data }: { data: Record<string, unknown> }) => ({
              id: "resume-1",
              ...data,
            }),
          },
          userProfile: {
            findUnique: async () => null,
          },
        }),
    } as never,
    {
      putObject: async () => "https://storage/resume-1.pdf",
    } as never,
    {
      enqueueFromMasterResumeUpload: async (input: unknown) => {
        enqueueCalls.push(input);
        await extractionPromise;
        return { id: "ext-1" };
      },
    } as never,
  );
  (
    service as unknown as { extractCvText: () => Promise<string> }
  ).extractCvText = async () =>
    "Ana Souza\nData Analyst\nExperiencia em analytics e projetos\nEducation and skills";

  const createPromise = service.create(
    "user-1",
    { title: "CV Master" },
    createFileUpload(),
    "turnstile-upload-token",
  );

  let createdResolved = false;
  createPromise.then(() => {
    createdResolved = true;
  });

  await setImmediate();
  assert.equal(createdResolved, false);

  resolveExtraction?.();

  const created = await createPromise;

  assert.equal(created.id, "resume-1");
  assert.equal(enqueueCalls.length, 1);
  assert.deepEqual(enqueueCalls[0], {
    userId: "user-1",
    resumeId: "resume-1",
    file: {
      buffer: createFileUpload().buffer,
      originalname: "cv.pdf",
      mimetype: "application/pdf",
      size: 12,
    },
  });
});

test("create delegates master CV uploads to synchronous extraction without heuristic merge", async () => {
  let extractionCalls = 0;
  const enqueueCalls: Array<unknown> = [];

  const service = new ResumesService(
    {
      $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          resume: {
            count: async () => 0,
            updateMany: async () => ({ count: 0 }),
            create: async ({ data }: { data: Record<string, unknown> }) => ({
              id: "resume-sync-1",
              ...data,
            }),
          },
          userProfile: {
            findUnique: async () => null,
          },
        }),
    } as never,
    {
      putObject: async () => "https://storage/resume-sync-1.pdf",
    } as never,
    {
      enqueueFromMasterResumeUpload: async (input: unknown) => {
        extractionCalls += 1;
        enqueueCalls.push(input);
        return { id: "ext-sync-1" };
      },
    } as never,
  );
  (
    service as unknown as { extractCvText: () => Promise<string> }
  ).extractCvText = async () => "";

  const created = await service.create(
    "user-1",
    { title: "CV Master" },
    createFileUpload(),
    "turnstile-upload-token",
  );

  assert.equal(created.id, "resume-sync-1");
  assert.equal(extractionCalls, 1);
  assert.equal(enqueueCalls.length, 1);
});

test("create requires a turnstile token for uploaded master CVs", async () => {
  let extractCalls = 0;
  const enqueueCalls: Array<unknown> = [];

  const service = new ResumesService(
    {
      $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          resume: {
            count: async () => 0,
            updateMany: async () => ({ count: 0 }),
            create: async ({ data }: { data: Record<string, unknown> }) => ({
              id: "resume-4",
              ...data,
            }),
          },
          userProfile: {
            findUnique: async () => null,
          },
        }),
    } as never,
    {
      putObject: async () => "https://storage/resume-4.pdf",
    } as never,
    {
      enqueueFromMasterResumeUpload: async (input: unknown) => {
        enqueueCalls.push(input);
        return { id: "ext-4" };
      },
    } as never,
  );
  (
    service as unknown as { extractCvText: () => Promise<string> }
  ).extractCvText = async () => {
    extractCalls += 1;
    return "Ana Souza\nData Analyst\nExperiencia em analytics e projetos\nEducation and skills";
  };

  await assert.rejects(
    () => service.create("user-1", { title: "CV Master" }, createFileUpload()),
    /turnstile/i,
  );

  assert.equal(extractCalls, 0);
  assert.equal(enqueueCalls.length, 0);
});

test("create still succeeds when extraction enqueue fails", async () => {
  let enqueueAttempted = false;

  const service = new ResumesService(
    {
      $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          resume: {
            count: async () => 0,
            updateMany: async () => ({ count: 0 }),
            create: async ({ data }: { data: Record<string, unknown> }) => ({
              id: "resume-2",
              ...data,
            }),
          },
          userProfile: {
            findUnique: async () => null,
          },
        }),
    } as never,
    {
      putObject: async () => "https://storage/resume-2.pdf",
    } as never,
    {
      enqueueFromMasterResumeUpload: async () => {
        enqueueAttempted = true;
        throw new Error("queue unavailable");
      },
    } as never,
  );
  (
    service as unknown as { extractCvText: () => Promise<string> }
  ).extractCvText = async () =>
    "Ana Souza\nData Analyst\nExperiencia em analytics e projetos\nEducation and skills";

  const created = await service.create(
    "user-1",
    { title: "CV Master" },
    createFileUpload(),
    "turnstile-upload-token",
  );

  assert.equal(created.id, "resume-2");
  assert.equal(enqueueAttempted, true);
});

test("create succeeds when extraction service is not provided", async () => {
  const service = new ResumesService(
    {
      $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          resume: {
            count: async () => 0,
            updateMany: async () => ({ count: 0 }),
            create: async ({ data }: { data: Record<string, unknown> }) => ({
              id: "resume-3",
              ...data,
            }),
          },
          userProfile: {
            findUnique: async () => null,
          },
        }),
    } as never,
    {
      putObject: async () => "https://storage/resume-3.pdf",
    } as never,
  );
  (
    service as unknown as { extractCvText: () => Promise<string> }
  ).extractCvText = async () =>
    "Ana Souza\nData Analyst\nExperiencia em analytics e projetos\nEducation and skills";

  const created = await service.create(
    "user-1",
    { title: "CV Master" },
    createFileUpload(),
    "turnstile-upload-token",
  );

  assert.equal(created.id, "resume-3");
});
