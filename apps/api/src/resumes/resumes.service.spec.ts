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

test("create deletes the previous master resume (and its dependents) instead of just demoting it", async () => {
  const findManyCalls: Array<Record<string, unknown>> = [];
  const deleteManyCalls: Array<Record<string, unknown>> = [];
  const updateManyCalls: Array<Record<string, unknown>> = [];

  const service = new ResumesService(
    {
      $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          resume: {
            count: async () => 1,
            updateMany: async (args: { where: Record<string, unknown> }) => {
              updateManyCalls.push(args.where);
              return { count: 0 };
            },
            findMany: async (args: { where: Record<string, unknown> }) => {
              findManyCalls.push(args.where);
              return [{ id: "old-master-1" }];
            },
            deleteMany: async (args: { where: Record<string, unknown> }) => {
              deleteManyCalls.push(args.where);
              return { count: 1 };
            },
            create: async ({ data }: { data: Record<string, unknown> }) => ({
              id: "resume-new-1",
              ...data,
            }),
          },
          userProfile: {
            findUnique: async () => null,
          },
        }),
    } as never,
    {
      putObject: async () => "https://storage/resume-new-1.pdf",
    } as never,
    {
      enqueueFromMasterResumeUpload: async () => ({ id: "ext-new-1" }),
    } as never,
  );
  (
    service as unknown as { extractCvText: () => Promise<string> }
  ).extractCvText = async () => "";

  const created = await service.create(
    "user-1",
    { title: "CV Master", isPrimary: true },
    createFileUpload(),
    "turnstile-upload-token",
  );

  assert.equal(created.id, "resume-new-1");
  // Finds the existing master resume(s)...
  assert.deepEqual(findManyCalls[0], { userId: "user-1", kind: "master" });
  // ...clears any resume derived from it (would otherwise violate the
  // adapted-resume-requires-context check once orphaned)...
  assert.deepEqual(deleteManyCalls[0], {
    userId: "user-1",
    basedOnResumeId: "old-master-1",
  });
  // ...then deletes the old master resume itself (cascades to its
  // extraction via onDelete: Cascade) — never just demoted.
  assert.deepEqual(deleteManyCalls[1], {
    userId: "user-1",
    id: { in: ["old-master-1"] },
  });
  assert.equal(updateManyCalls.length, 1);
});

test("create does not wait for master CV extraction to finish", async () => {
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
            findMany: async () => [],
            deleteMany: async () => ({ count: 0 }),
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
      // enqueueFromMasterResumeUpload creates the extraction row and returns
      // it right away — the AI extraction itself runs detached in the
      // background, so this mock resolves before extractionPromise settles.
      enqueueFromMasterResumeUpload: async (input: unknown) => {
        enqueueCalls.push(input);
        void extractionPromise;
        return { id: "ext-1", status: "pending" };
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

  resolveExtraction?.();
  await setImmediate();
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
            findMany: async () => [],
            deleteMany: async () => ({ count: 0 }),
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

test("create clears the existing profile before creating the replacement resume when clearExistingProfile is set", async () => {
  const profileUpdateManyCalls: Array<unknown> = [];
  const callOrder: string[] = [];

  const service = new ResumesService(
    {
      userProfile: {
        updateMany: async (args: unknown) => {
          profileUpdateManyCalls.push(args);
          callOrder.push("profile-cleared");
          return { count: 1 };
        },
      },
      $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          resume: {
            count: async () => 1,
            updateMany: async () => ({ count: 0 }),
            findMany: async () => [],
            deleteMany: async () => ({ count: 0 }),
            create: async ({ data }: { data: Record<string, unknown> }) => {
              callOrder.push("resume-created");
              return { id: "resume-replace-1", ...data };
            },
          },
          userProfile: {
            findUnique: async () => null,
          },
        }),
    } as never,
    {
      putObject: async () => "https://storage/resume-replace-1.pdf",
    } as never,
    {
      enqueueFromMasterResumeUpload: async () => ({ id: "ext-replace-1" }),
    } as never,
  );
  (
    service as unknown as { extractCvText: () => Promise<string> }
  ).extractCvText = async () => "";

  const created = await service.create(
    "user-1",
    { title: "CV Master", clearExistingProfile: true },
    createFileUpload(),
    "turnstile-upload-token",
  );

  assert.equal(created.id, "resume-replace-1");
  assert.equal(profileUpdateManyCalls.length, 1);
  assert.deepEqual(callOrder, ["profile-cleared", "resume-created"]);

  const clearedData = (
    profileUpdateManyCalls[0] as { where: { userId: string }; data: Record<string, unknown> }
  ).data;
  assert.equal(clearedData.fullName, null);
  assert.equal(clearedData.headline, null);
  assert.deepEqual(clearedData.experiencesJson, []);
  assert.equal(clearedData.profileReadinessStatus, "empty");
});

test("create does not touch the profile when clearExistingProfile is not set", async () => {
  let profileUpdateManyCalled = false;

  const service = new ResumesService(
    {
      userProfile: {
        updateMany: async () => {
          profileUpdateManyCalled = true;
          return { count: 0 };
        },
      },
      $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          resume: {
            count: async () => 0,
            updateMany: async () => ({ count: 0 }),
            findMany: async () => [],
            deleteMany: async () => ({ count: 0 }),
            create: async ({ data }: { data: Record<string, unknown> }) => ({
              id: "resume-first-1",
              ...data,
            }),
          },
          userProfile: {
            findUnique: async () => null,
          },
        }),
    } as never,
    {
      putObject: async () => "https://storage/resume-first-1.pdf",
    } as never,
    {
      enqueueFromMasterResumeUpload: async () => ({ id: "ext-first-1" }),
    } as never,
  );
  (
    service as unknown as { extractCvText: () => Promise<string> }
  ).extractCvText = async () => "";

  await service.create(
    "user-1",
    { title: "CV Master" },
    createFileUpload(),
    "turnstile-upload-token",
  );

  assert.equal(profileUpdateManyCalled, false);
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
            findMany: async () => [],
            deleteMany: async () => ({ count: 0 }),
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
            findMany: async () => [],
            deleteMany: async () => ({ count: 0 }),
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
            findMany: async () => [],
            deleteMany: async () => ({ count: 0 }),
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

test("remove deletes dependent resumes instead of promoting a new master", async () => {
  const deleteManyCalls: Array<Record<string, unknown>> = [];

  const service = new ResumesService(
    {
      resume: {
        findFirst: async () => ({ id: "resume-1", userId: "user-1" }),
      },
      $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          resume: {
            deleteMany: async (args: { where: Record<string, unknown> }) => {
              deleteManyCalls.push(args.where);
              return { count: 1 };
            },
          },
        }),
    } as never,
    {} as never,
  );

  const result = await service.remove("user-1", "resume-1");

  assert.deepEqual(result, { ok: true });
  assert.equal(deleteManyCalls.length, 2);
  // Limpa quem dependia do resume deletado antes de deletar o próprio resume —
  // sem tentar promover outro resume a master.
  assert.deepEqual(deleteManyCalls[0], {
    userId: "user-1",
    basedOnResumeId: "resume-1",
  });
  assert.deepEqual(deleteManyCalls[1], { id: "resume-1", userId: "user-1" });
});
