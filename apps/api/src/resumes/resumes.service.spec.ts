import assert from "node:assert/strict";
import { test } from "node:test";

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

test("create enqueues master CV canonical extraction after master upload with rawText", async () => {
  const enqueueCalls: Array<unknown> = [];

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
    { merge: () => ({}) } as never,
    { compute: () => "partial" } as never,
    {
      enqueueFromMasterResumeUpload: async (input: unknown) => {
        enqueueCalls.push(input);
        return { id: "ext-1" };
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
  );

  assert.equal(created.id, "resume-1");
  assert.equal(enqueueCalls.length, 1);
  assert.deepEqual(enqueueCalls[0], {
    userId: "user-1",
    resumeId: "resume-1",
    rawText:
      "Ana Souza\nData Analyst\nExperiencia em analytics e projetos\nEducation and skills",
  });
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
    { merge: () => ({}) } as never,
    { compute: () => "partial" } as never,
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
    { merge: () => ({}) } as never,
    { compute: () => "partial" } as never,
  );
  (
    service as unknown as { extractCvText: () => Promise<string> }
  ).extractCvText = async () =>
    "Ana Souza\nData Analyst\nExperiencia em analytics e projetos\nEducation and skills";

  const created = await service.create(
    "user-1",
    { title: "CV Master" },
    createFileUpload(),
  );

  assert.equal(created.id, "resume-3");
});
