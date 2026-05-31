import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { JobApplicationsController } from "./job-applications.controller";
import { JobApplicationsService } from "./job-applications.service";

const JobApplicationsServiceCtor = JobApplicationsService as unknown as new (
  db: unknown,
) => JobApplicationsService;

function makeDb() {
  const db = {
    jobApplication: {
      findMany: async () => [
        {
          id: "app-1",
          userId: "user-1",
          jobTitle: "Engenheiro de Dados",
          companyName: "Acme",
          status: "ANALYZED",
          updatedAt: new Date("2026-05-02T12:00:00Z"),
          createdAt: new Date("2026-05-01T12:00:00Z"),
          cvAdaptations: [
            {
              id: "a1",
              createdAt: new Date("2026-05-01T10:00:00Z"),
              status: "analyzing",
              adaptedResumeId: null,
              isUnlocked: false,
              adaptedContentJson: { scoreAfter: 80 },
            },
            {
              id: "a2",
              createdAt: new Date("2026-05-02T10:00:00Z"),
              status: "delivered",
              adaptedResumeId: "resume-1",
              isUnlocked: true,
              adaptedContentJson: { scoreAfter: 80 },
            },
          ],
          events: [],
          interviewPrep: null,
        },
      ],
      count: async () => 1,
      findFirst: async () => null,
      create: async () => null,
      update: async () => null,
    },
    cvAdaptation: {
      findUnique: async () => null,
      update: async () => null,
    },
    jobApplicationEvent: {
      create: async () => null,
      createMany: async () => ({ count: 0 }),
    },
    $transaction: async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> =>
      fn(db),
  };

  return db;
}

const interviewPrepStub = {
  generateOrGet: async () => ({ id: "prep-1" }),
};

test("controller query pipes pin expectedType for pagination DTOs", () => {
  const source = readFileSync(
    new URL("./job-applications.controller.ts", import.meta.url),
    "utf8",
  );

  assert.match(source, /expectedType: ListJobApplicationsDto/);
  assert.match(source, /expectedType: ListJobApplicationHighlightsDto/);
});

test("list/controller payload includes derived best-version fields", async () => {
  const db = makeDb();
  const service = new JobApplicationsServiceCtor(db);
  const controller = new JobApplicationsController(service, interviewPrepStub);

  const response = await controller.list(
    { id: "user-1" },
    { page: 1, limit: 20, archived: false, status: undefined },
  );
  const item = response.items[0] as Record<string, unknown>;

  assert.equal(item.bestScore, 80);
  assert.equal(item.bestCvAdaptationId, "a2");
  assert.equal(item.bestCvState, "ready");
  assert.equal(item.scorePresentation, "scored");
});

test("highlights/controller returns relevance-ranked items with derived fields", async () => {
  const db = makeDb();
  const service = new JobApplicationsServiceCtor(db);
  const controller = new JobApplicationsController(service, interviewPrepStub);

  const response = await controller.listHighlights(
    { id: "user-1" },
    { limit: 1 },
  );

  assert.equal(response.length, 1);
  const item = response[0] as Record<string, unknown>;
  assert.equal(item.bestScore, 80);
  assert.equal(item.bestCvAdaptationId, "a2");
  assert.equal(item.bestCvState, "ready");
  assert.equal(item.scorePresentation, "scored");
});

test("split/controller delegates to service with authenticated user", async () => {
  const db = makeDb();
  const service = new JobApplicationsServiceCtor(db);
  const controller = new JobApplicationsController(service, interviewPrepStub);

  let captured: string[] = [];
  (
    service as unknown as {
      splitAnalysisIntoNewApplication: (
        userId: string,
        applicationId: string,
        adaptationId: string,
      ) => Promise<{ newApplicationId: string }>;
    }
  ).splitAnalysisIntoNewApplication = async (
    userId: string,
    applicationId: string,
    adaptationId: string,
  ) => {
    captured = [userId, applicationId, adaptationId];
    return { newApplicationId: "app-new" };
  };

  const result = await controller.splitAnalysis(
    { id: "user-1" },
    "app-1",
    "adapt-1",
  );

  assert.deepEqual(captured, ["user-1", "app-1", "adapt-1"]);
  assert.deepEqual(result, { newApplicationId: "app-new" });
});

test("archive and restore/controller delegates with authenticated user", async () => {
  const db = makeDb();
  const service = new JobApplicationsServiceCtor(db);
  const controller = new JobApplicationsController(service, interviewPrepStub);

  let archiveCaptured: string[] = [];
  let restoreCaptured: string[] = [];

  (
    service as unknown as {
      archive: (userId: string, id: string) => Promise<{ id: string }>;
      restore: (userId: string, id: string) => Promise<{ id: string }>;
    }
  ).archive = async (userId: string, id: string) => {
    archiveCaptured = [userId, id];
    return { id };
  };

  (
    service as unknown as {
      archive: (userId: string, id: string) => Promise<{ id: string }>;
      restore: (userId: string, id: string) => Promise<{ id: string }>;
    }
  ).restore = async (userId: string, id: string) => {
    restoreCaptured = [userId, id];
    return { id };
  };

  const archived = await controller.archive({ id: "user-1" }, "app-1");
  const restored = await controller.restore({ id: "user-1" }, "app-1");

  assert.deepEqual(archiveCaptured, ["user-1", "app-1"]);
  assert.deepEqual(restoreCaptured, ["user-1", "app-1"]);
  assert.deepEqual(archived, { id: "app-1" });
  assert.deepEqual(restored, { id: "app-1" });
});

test("delete/controller delegates with authenticated user", async () => {
  const db = makeDb();
  const service = new JobApplicationsServiceCtor(db);
  const controller = new JobApplicationsController(service, interviewPrepStub);

  let captured: string[] = [];
  (
    service as unknown as {
      delete: (userId: string, id: string) => Promise<{ id: string }>;
    }
  ).delete = async (userId: string, id: string) => {
    captured = [userId, id];
    return { id };
  };

  const result = await controller.delete({ id: "user-1" }, "app-1");

  assert.deepEqual(captured, ["user-1", "app-1"]);
  assert.deepEqual(result, { id: "app-1" });
});
