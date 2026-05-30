import assert from "node:assert/strict";
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

test("list/controller payload includes derived best-version fields", async () => {
  const db = makeDb();
  const service = new JobApplicationsServiceCtor(db);
  const controller = new JobApplicationsController(service, interviewPrepStub);

  const response = await controller.list(
    { id: "user-1" },
    { page: 1, limit: 20, status: undefined },
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
