import assert from "node:assert/strict";
import { test } from "node:test";
import { ConflictException } from "@nestjs/common";

import { JobApplicationsService } from "./job-applications.service";

type DbMock = Record<string, Record<string, unknown>>;

const JobApplicationsServiceCtor = JobApplicationsService as unknown as new (
  db: unknown,
) => JobApplicationsService;

function makeDb(overrides: Partial<DbMock> = {}): DbMock {
  const createdEvents: unknown[] = [];
  const jobApplications: Map<string, Record<string, unknown>> = new Map();
  const cvAdaptations: Map<string, Record<string, unknown>> = new Map();
  let nextApplicationId = 1;

  const defaultDb: DbMock = {
    jobApplication: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const record = { id: `app-${nextApplicationId++}`, ...data };
        jobApplications.set(record.id as string, record);
        return record;
      },
      findMany: async () => [],
      findFirst: async ({ where }: { where: Record<string, unknown> }) => {
        for (const [, app] of jobApplications) {
          if (where.id && app.id !== where.id) continue;
          if (where.userId && app.userId !== where.userId) continue;
          if (Object.hasOwn(where, "deletedAt")) {
            if (where.deletedAt === null && (app.deletedAt ?? null) !== null)
              continue;
          }
          return app;
        }
        return null;
      },
      update: async ({
        where,
        data,
      }: {
        where: Record<string, unknown>;
        data: Record<string, unknown>;
      }) => {
        const existing = jobApplications.get(where.id as string);
        if (!existing) return null;
        const updated = { ...existing, ...data };
        jobApplications.set(where.id as string, updated);
        return updated;
      },
      count: async () => 0,
    },
    jobApplicationEvent: {
      create: async ({ data }: { data: unknown }) => {
        createdEvents.push(data);
        return {
          id: `event-${createdEvents.length}`,
          ...(data as Record<string, unknown>),
        };
      },
      createMany: async ({ data }: { data: unknown[] }) => {
        for (const item of data) {
          createdEvents.push(item);
        }
        return { count: data.length };
      },
    },
    cvAdaptation: {
      findUnique: async ({ where }: { where: Record<string, unknown> }) =>
        cvAdaptations.get(where.id as string) ?? null,
      findFirst: async ({ where }: { where: Record<string, unknown> }) => {
        for (const [, adaptation] of cvAdaptations) {
          if (
            where.jobApplicationId !== undefined &&
            adaptation.jobApplicationId !== where.jobApplicationId
          ) {
            continue;
          }

          if (where.OR && Array.isArray(where.OR)) {
            const matchesAny = where.OR.some((clause) => {
              if (!clause || typeof clause !== "object") return false;
              const entry = clause as Record<string, unknown>;
              return Object.entries(entry).every(
                ([key, value]) => adaptation[key] === value,
              );
            });

            if (!matchesAny) continue;
          }

          return adaptation;
        }

        return null;
      },
      findMany: async ({ where }: { where: Record<string, unknown> }) => {
        const rows = Array.from(cvAdaptations.values()).filter((adaptation) => {
          if (
            where.jobApplicationId !== undefined &&
            adaptation.jobApplicationId !== where.jobApplicationId
          ) {
            return false;
          }
          if (where.id && typeof where.id === "object") {
            const idFilter = where.id as { not?: string };
            if (idFilter.not && adaptation.id === idFilter.not) {
              return false;
            }
          }
          return true;
        });

        rows.sort((a, b) => {
          const aCreatedAt = (a.createdAt as Date | undefined)?.getTime() ?? 0;
          const bCreatedAt = (b.createdAt as Date | undefined)?.getTime() ?? 0;
          return bCreatedAt - aCreatedAt;
        });

        return rows;
      },
      update: async ({
        where,
        data,
      }: {
        where: Record<string, unknown>;
        data: Record<string, unknown>;
      }) => {
        const existing = cvAdaptations.get(where.id as string) ?? {};
        const updated = { ...existing, ...data };
        cvAdaptations.set(where.id as string, updated);
        return updated;
      },
    },
    $transaction: async <T>(fn: (tx: DbMock) => Promise<T>): Promise<T> => {
      return fn(defaultDb as unknown as DbMock);
    },
    _createdEvents: createdEvents,
    _jobApplications: jobApplications,
    _cvAdaptations: cvAdaptations,
  };

  return { ...defaultDb, ...overrides };
}

// ─── createManual ─────────────────────────────────────────────────────────────

test("createManual creates application with SAVED status", async () => {
  const db = makeDb();
  const service = new JobApplicationsServiceCtor(db);

  const result = await service.createManual("user-1", {
    jobTitle: "Engenheiro de Software",
    companyName: "Acme Corp",
  });

  assert.equal(result.status, "SAVED");
  assert.equal(result.userId, "user-1");
  assert.equal(result.jobTitle, "Engenheiro de Software");
  assert.equal(result.companyName, "Acme Corp");
});

test("createManual creates APPLICATION_CREATED event", async () => {
  const db = makeDb();
  const service = new JobApplicationsServiceCtor(db);

  await service.createManual("user-1", {
    jobTitle: "Designer",
    companyName: "Studio X",
  });

  const events = db._createdEvents as Array<{ eventType: string }>;
  assert.ok(events.some((e) => e.eventType === "APPLICATION_CREATED"));
});

test("createManual accepts optional fields for manual origin", async () => {
  const db = makeDb();
  const service = new JobApplicationsServiceCtor(db);

  const result = await service.createManual("user-1", {
    jobTitle: "Analista",
    companyName: "Beta",
    origin: "manual",
  });

  assert.equal(result.jobUrl, null);
  assert.equal(result.jobDescriptionText, null);
});

test("createManual requires jobUrl when origin is imported_url", async () => {
  const db = makeDb();
  const service = new JobApplicationsServiceCtor(db);

  await assert.rejects(
    () =>
      service.createManual("user-1", {
        jobTitle: "Dev",
        companyName: "Corp",
        origin: "imported_url",
      }),
    /obrigatório/,
  );
});

// ─── updateStatus ─────────────────────────────────────────────────────────────

test("updateStatus records STATUS_CHANGED event", async () => {
  const db = makeDb();
  const service = new JobApplicationsServiceCtor(db);

  const created = await service.createManual("user-1", {
    jobTitle: "Dev",
    companyName: "Corp",
  });

  await service.updateStatus("user-1", created.id, "APPLIED");

  const events = db._createdEvents as Array<{ eventType: string }>;
  assert.ok(events.some((e) => e.eventType === "MARKED_AS_SENT"));
});

test("updateStatus sets appliedAt when status changes to APPLIED", async () => {
  const db = makeDb();

  let appliedAtSet: unknown;
  const originalUpdate = (db.jobApplication as Record<string, unknown>)
    .update as (args: {
    where: Record<string, unknown>;
    data: Record<string, unknown>;
  }) => Promise<unknown>;
  (db.jobApplication as Record<string, unknown>).update = async (args: {
    where: Record<string, unknown>;
    data: Record<string, unknown>;
  }) => {
    appliedAtSet = args.data.appliedAt;
    return originalUpdate(args);
  };

  const service = new JobApplicationsServiceCtor(db);
  const created = await service.createManual("user-1", {
    jobTitle: "Dev",
    companyName: "Corp",
  });

  await service.updateStatus("user-1", created.id, "APPLIED");

  assert.ok(appliedAtSet instanceof Date);
});

test("updateStatus does not overwrite existing appliedAt", async () => {
  const db = makeDb();
  const existingAppliedAt = new Date("2026-01-15");

  // Seed an application with appliedAt already set
  const apps = db._jobApplications as Map<string, Record<string, unknown>>;
  const appId = "existing-app";
  apps.set(appId, {
    id: appId,
    userId: "user-1",
    status: "IN_PROCESS",
    appliedAt: existingAppliedAt,
  });

  let capturedData: Record<string, unknown> = {};
  const originalUpdate = (db.jobApplication as Record<string, unknown>)
    .update as (args: {
    where: Record<string, unknown>;
    data: Record<string, unknown>;
  }) => Promise<unknown>;
  (db.jobApplication as Record<string, unknown>).update = async (args: {
    where: Record<string, unknown>;
    data: Record<string, unknown>;
  }) => {
    capturedData = args.data;
    return originalUpdate(args);
  };

  const service = new JobApplicationsServiceCtor(db);
  await service.updateStatus("user-1", appId, "APPLIED");

  assert.ok(!("appliedAt" in capturedData));
});

test("updateStatus throws NotFoundException for unknown application", async () => {
  const db = makeDb();
  const service = new JobApplicationsServiceCtor(db);

  await assert.rejects(
    () => service.updateStatus("user-1", "nonexistent", "APPLIED"),
    /not found/i,
  );
});

test("updateStatus enforces ownership — another user cannot update", async () => {
  const db = makeDb();
  const service = new JobApplicationsServiceCtor(db);

  const created = await service.createManual("user-1", {
    jobTitle: "Dev",
    companyName: "Corp",
  });

  await assert.rejects(
    () => service.updateStatus("user-2", created.id, "APPLIED"),
    /not found/i,
  );
});

// ─── addNote ──────────────────────────────────────────────────────────────────

test("addNote records NOTE_ADDED event", async () => {
  const db = makeDb();
  const service = new JobApplicationsServiceCtor(db);

  const created = await service.createManual("user-1", {
    jobTitle: "Dev",
    companyName: "Corp",
  });

  await service.addNote("user-1", created.id, "Lembrar de preparar portfólio.");

  const events = db._createdEvents as Array<{ eventType: string }>;
  assert.ok(events.some((e) => e.eventType === "NOTE_ADDED"));
});

test("addNote enforces ownership", async () => {
  const db = makeDb();
  const service = new JobApplicationsServiceCtor(db);

  const created = await service.createManual("user-1", {
    jobTitle: "Dev",
    companyName: "Corp",
  });

  await assert.rejects(
    () => service.addNote("user-2", created.id, "nota"),
    /not found/i,
  );
});

// ─── upsertFromCvAdaptation ───────────────────────────────────────────────────

test("upsertFromCvAdaptation creates new JobApplication from CvAdaptation data", async () => {
  const db = makeDb();

  const adaptations = db._cvAdaptations as Map<string, Record<string, unknown>>;
  adaptations.set("adapt-1", { id: "adapt-1", jobApplicationId: null });

  const service = new JobApplicationsServiceCtor(db);

  await service.upsertFromCvAdaptation({
    userId: "user-1",
    cvAdaptationId: "adapt-1",
    jobTitle: "Desenvolvedor Full Stack",
    companyName: "Tech LTDA",
    jobDescriptionText: "Descricao da vaga...",
    targetStatus: "ANALYZED",
    origin: "analysis_auto",
  });

  const apps = db._jobApplications as Map<string, Record<string, unknown>>;
  assert.equal(apps.size, 1);
  const app = Array.from(apps.values())[0];
  assert.equal(app.status, "ANALYZED");
  assert.equal(app.jobTitle, "Desenvolvedor Full Stack");
  assert.equal(app.companyName, "Tech LTDA");
  assert.equal(app.currentCvAdaptationId, "adapt-1");
});

test("upsertFromCvAdaptation derives score from score_pos_ajustes payload", async () => {
  const db = makeDb();

  const adaptations = db._cvAdaptations as Map<string, Record<string, unknown>>;
  adaptations.set("adapt-score", {
    id: "adapt-score",
    jobApplicationId: null,
    adaptedContentJson: { projecao_melhoria: { score_pos_ajustes: 88 } },
  });

  const service = new JobApplicationsServiceCtor(db);

  await service.upsertFromCvAdaptation({
    userId: "user-1",
    cvAdaptationId: "adapt-score",
    jobTitle: "Analista",
    companyName: "Corp",
    jobDescriptionText: null,
    targetStatus: "ANALYZED",
    origin: "analysis_auto",
  });

  const app = Array.from(
    (db._jobApplications as Map<string, Record<string, unknown>>).values(),
  )[0];
  assert.equal(app.scoreAfter, 88);
});

test("upsertFromCvAdaptation links CvAdaptation to created JobApplication", async () => {
  const db = makeDb();

  const adaptations = db._cvAdaptations as Map<string, Record<string, unknown>>;
  adaptations.set("adapt-2", { id: "adapt-2", jobApplicationId: null });

  const service = new JobApplicationsServiceCtor(db);

  await service.upsertFromCvAdaptation({
    userId: "user-1",
    cvAdaptationId: "adapt-2",
    jobTitle: "Analista",
    companyName: "Corp",
    jobDescriptionText: null,
    targetStatus: "ANALYZED",
    origin: "analysis_auto",
  });

  const adapt = adaptations.get("adapt-2");
  assert.ok(adapt?.jobApplicationId);
});

test("upsertFromCvAdaptation links second CvAdaptation to existing JobApplication for same job", async () => {
  const db = makeDb();

  const adaptations = db._cvAdaptations as Map<string, Record<string, unknown>>;
  adaptations.set("adapt-3", { id: "adapt-3", jobApplicationId: null });
  adaptations.set("adapt-4", { id: "adapt-4", jobApplicationId: null });

  // Override findFirst to simulate existing JobApplication found by normalized title/company
  let findFirstCallCount = 0;
  let createdAppId: string | null = null;

  const originalCreate = (db.jobApplication as Record<string, unknown>)
    .create as (args: {
    data: Record<string, unknown>;
  }) => Promise<Record<string, unknown>>;
  (db.jobApplication as Record<string, unknown>).create = async (args: {
    data: Record<string, unknown>;
  }) => {
    const result = await originalCreate(args);
    createdAppId = result.id as string;
    return result;
  };

  const _originalFindFirst = (db.jobApplication as Record<string, unknown>)
    .findFirst as (args: {
    where: Record<string, unknown>;
  }) => Promise<Record<string, unknown> | null>;
  (db.jobApplication as Record<string, unknown>).findFirst = async (_args: {
    where: Record<string, unknown>;
  }) => {
    findFirstCallCount++;
    // Second call should find the already-created app
    if (createdAppId && findFirstCallCount > 1) {
      const apps = db._jobApplications as Map<string, Record<string, unknown>>;
      return apps.get(createdAppId) ?? null;
    }
    return null;
  };

  const service = new JobApplicationsServiceCtor(db);

  await service.upsertFromCvAdaptation({
    userId: "user-1",
    cvAdaptationId: "adapt-3",
    jobTitle: "Engenheiro",
    companyName: "Empresa",
    jobDescriptionText: null,
    targetStatus: "ANALYZED",
    origin: "analysis_auto",
  });

  await service.upsertFromCvAdaptation({
    userId: "user-1",
    cvAdaptationId: "adapt-4",
    jobTitle: "Engenheiro",
    companyName: "Empresa",
    jobDescriptionText: null,
    targetStatus: "CV_READY",
    origin: "optimized_cv_auto",
  });

  const apps = db._jobApplications as Map<string, Record<string, unknown>>;
  assert.equal(apps.size, 1, "deve haver apenas 1 JobApplication, não 2");
});

test("upsertFromCvAdaptation updates currentCvAdaptationId to latest adaptation", async () => {
  const db = makeDb();

  const adaptations = db._cvAdaptations as Map<string, Record<string, unknown>>;
  adaptations.set("adapt-5", { id: "adapt-5", jobApplicationId: null });
  adaptations.set("adapt-6", { id: "adapt-6", jobApplicationId: null });

  let capturedUpdateData: Record<string, unknown> | null = null;
  let createdAppId: string | null = null;

  const originalCreate = (db.jobApplication as Record<string, unknown>)
    .create as (args: {
    data: Record<string, unknown>;
  }) => Promise<Record<string, unknown>>;
  (db.jobApplication as Record<string, unknown>).create = async (args: {
    data: Record<string, unknown>;
  }) => {
    const result = await originalCreate(args);
    createdAppId = result.id as string;
    return result;
  };

  const originalUpdate = (db.jobApplication as Record<string, unknown>)
    .update as (args: {
    where: Record<string, unknown>;
    data: Record<string, unknown>;
  }) => Promise<Record<string, unknown>>;
  (db.jobApplication as Record<string, unknown>).update = async (args: {
    where: Record<string, unknown>;
    data: Record<string, unknown>;
  }) => {
    capturedUpdateData = args.data;
    return originalUpdate(args);
  };

  const _originalFindFirst = (db.jobApplication as Record<string, unknown>)
    .findFirst as (args: {
    where: Record<string, unknown>;
  }) => Promise<Record<string, unknown> | null>;
  let findFirstCallCount = 0;
  (db.jobApplication as Record<string, unknown>).findFirst = async (_args: {
    where: Record<string, unknown>;
  }) => {
    findFirstCallCount++;
    if (createdAppId && findFirstCallCount > 1) {
      const apps = db._jobApplications as Map<string, Record<string, unknown>>;
      return apps.get(createdAppId) ?? null;
    }
    return null;
  };

  const service = new JobApplicationsServiceCtor(db);

  await service.upsertFromCvAdaptation({
    userId: "user-1",
    cvAdaptationId: "adapt-5",
    jobTitle: "Dev",
    companyName: "Corp",
    jobDescriptionText: null,
    targetStatus: "ANALYZED",
    origin: "analysis_auto",
  });

  await service.upsertFromCvAdaptation({
    userId: "user-1",
    cvAdaptationId: "adapt-6",
    jobTitle: "Dev",
    companyName: "Corp",
    jobDescriptionText: null,
    targetStatus: "CV_READY",
    origin: "optimized_cv_auto",
  });

  assert.equal(
    capturedUpdateData?.currentCvAdaptationId,
    "adapt-6",
    "currentCvAdaptationId deve ser atualizado para a adaptação mais recente",
  );
});

test("upsertFromCvAdaptation does not override user-set statuses", async () => {
  const db = makeDb();
  const apps = db._jobApplications as Map<string, Record<string, unknown>>;
  const adaptations = db._cvAdaptations as Map<string, Record<string, unknown>>;

  // User already moved application to INTERVIEW
  apps.set("app-user-set", {
    id: "app-user-set",
    userId: "user-1",
    status: "INTERVIEW",
    normalizedJobTitle: "dev",
    normalizedCompanyName: "corp",
    createdAt: new Date(),
  });
  adaptations.set("adapt-7", {
    id: "adapt-7",
    jobApplicationId: "app-user-set",
  });

  let capturedStatus: unknown = null;
  const originalUpdate = (db.jobApplication as Record<string, unknown>)
    .update as (args: {
    where: Record<string, unknown>;
    data: Record<string, unknown>;
  }) => Promise<Record<string, unknown>>;
  (db.jobApplication as Record<string, unknown>).update = async (args: {
    where: Record<string, unknown>;
    data: Record<string, unknown>;
  }) => {
    capturedStatus = args.data.status;
    return originalUpdate(args);
  };

  const service = new JobApplicationsServiceCtor(db);

  await service.upsertFromCvAdaptation({
    userId: "user-1",
    cvAdaptationId: "adapt-7",
    jobTitle: "Dev",
    companyName: "Corp",
    jobDescriptionText: null,
    targetStatus: "CV_READY",
    origin: "optimized_cv_auto",
  });

  assert.equal(
    capturedStatus,
    undefined,
    "status não deve ser sobrescrito — usuário está em INTERVIEW",
  );
});

test("upsertFromCvAdaptation signals deferred persistence when jobTitle or companyName is missing", async () => {
  const db = makeDb();
  const service = new JobApplicationsServiceCtor(db);
  const warnings: string[] = [];
  const logger = (
    service as unknown as {
      logger: { warn: (message: string) => void };
    }
  ).logger;
  logger.warn = (message: string) => {
    warnings.push(message);
  };

  await service.upsertFromCvAdaptation({
    userId: "user-1",
    cvAdaptationId: "adapt-8",
    jobTitle: null,
    companyName: "Corp",
    jobDescriptionText: null,
    targetStatus: "ANALYZED",
    origin: "analysis_auto",
  });

  const apps = db._jobApplications as Map<string, Record<string, unknown>>;
  assert.equal(apps.size, 0, "nenhuma JobApplication deve ser criada");
  assert.ok(
    warnings.some((message) =>
      message.toLowerCase().includes("persistence deferred"),
    ),
    "deve registrar warning com semantica explicita de persistencia adiada",
  );
});

test("upsertFromCvAdaptation does not create application when title/company are missing", async () => {
  const db = makeDb();
  const adaptations = db._cvAdaptations as Map<string, Record<string, unknown>>;
  adaptations.set("adapt-missing-identity", {
    id: "adapt-missing-identity",
    jobApplicationId: null,
  });

  const service = new JobApplicationsServiceCtor(db);

  await service.upsertFromCvAdaptation({
    userId: "user-1",
    cvAdaptationId: "adapt-missing-identity",
    jobTitle: null,
    companyName: null,
    jobDescriptionText: null,
    targetStatus: "ANALYZED",
    origin: "optimized_cv_auto",
  });

  const apps = db._jobApplications as Map<string, Record<string, unknown>>;
  assert.equal(apps.size, 0);
  assert.equal(
    adaptations.get("adapt-missing-identity")?.jobApplicationId ?? null,
    null,
  );
});

test("derives best adaptation preferring CV_READY when scores tie", async () => {
  const db = makeDb({
    jobApplication: {
      ...(makeDb().jobApplication as Record<string, unknown>),
      findMany: async () => [
        {
          id: "app-1",
          userId: "user-1",
          jobTitle: "Engenheiro",
          companyName: "Empresa",
          status: "ANALYZED",
          updatedAt: new Date("2026-05-02T12:00:00Z"),
          cvAdaptations: [
            {
              id: "a1",
              createdAt: new Date("2026-05-01T10:00:00Z"),
              status: "analyzing",
              adaptedResumeId: null,
              isUnlocked: false,
              adaptedContentJson: { scoreAfter: 82 },
            },
            {
              id: "a2",
              createdAt: new Date("2026-05-02T10:00:00Z"),
              status: "delivered",
              adaptedResumeId: "resume-1",
              isUnlocked: true,
              adaptedContentJson: { scoreAfter: 82 },
            },
          ],
          events: [],
          interviewPrep: null,
        },
      ],
      count: async () => 1,
    },
  });

  const service = new JobApplicationsServiceCtor(db);
  const response = await service.list("user-1", 1, 20);
  const item = response.items[0] as Record<string, unknown>;

  assert.equal(item.bestCvAdaptationId, "a2");
  assert.equal(item.bestScore, 82);
  assert.equal(item.bestCvState, "ready");
  assert.equal(item.scorePresentation, "scored");
});

test("list scopes by archived flag and always excludes deleted", async () => {
  let capturedWhere: Record<string, unknown> | null = null;

  const db = makeDb({
    jobApplication: {
      ...(makeDb().jobApplication as Record<string, unknown>),
      findMany: async ({ where }: { where: Record<string, unknown> }) => {
        capturedWhere = where;
        return [];
      },
      count: async () => 0,
    },
  });

  const service = new JobApplicationsServiceCtor(db);

  await service.list("user-1", 1, 20, false, "INTERVIEW");
  assert.deepEqual(capturedWhere, {
    userId: "user-1",
    deletedAt: null,
    archivedAt: null,
    status: "INTERVIEW",
  });

  await service.list("user-1", 1, 20, true, "INTERVIEW");
  assert.deepEqual(capturedWhere, {
    userId: "user-1",
    deletedAt: null,
    archivedAt: { not: null },
    status: "INTERVIEW",
  });
});

test("listHighlights queries active-only visibility scope", async () => {
  let capturedWhere: Record<string, unknown> | null = null;

  const db = makeDb({
    jobApplication: {
      ...(makeDb().jobApplication as Record<string, unknown>),
      findMany: async ({ where }: { where: Record<string, unknown> }) => {
        capturedWhere = where;
        return [];
      },
      count: async () => 0,
    },
  });

  const service = new JobApplicationsServiceCtor(db);
  await service.listHighlights("user-1", 3);

  assert.deepEqual(capturedWhere, {
    userId: "user-1",
    archivedAt: null,
    deletedAt: null,
  });
});

test("listHighlights returns applications ordered by most recently updated first", async () => {
  const db = makeDb({
    jobApplication: {
      ...(makeDb().jobApplication as Record<string, unknown>),
      findMany: async () => [
        {
          id: "app-newest",
          userId: "user-1",
          jobTitle: "Newest",
          companyName: "C",
          status: "REJECTED",
          updatedAt: new Date("2026-05-03T10:00:00Z"),
          cvAdaptations: [],
          events: [],
          interviewPrep: null,
        },
        {
          id: "app-middle",
          userId: "user-1",
          jobTitle: "Middle",
          companyName: "O",
          status: "ANALYZED",
          updatedAt: new Date("2026-05-02T10:00:00Z"),
          cvAdaptations: [],
          events: [],
          interviewPrep: null,
        },
        {
          id: "app-oldest",
          userId: "user-1",
          jobTitle: "Oldest",
          companyName: "P",
          status: "INTERVIEW",
          updatedAt: new Date("2026-05-01T10:00:00Z"),
          cvAdaptations: [],
          events: [],
          interviewPrep: null,
        },
      ],
      count: async () => 3,
    },
  });

  const service = new JobApplicationsServiceCtor(db);
  const items = await service.listHighlights("user-1", 3);

  assert.deepEqual(
    items.map((item) => item.id),
    ["app-newest", "app-middle", "app-oldest"],
  );
});

test("getHighlightsSummary returns full KPI totals for the user", async () => {
  let capturedWhere: Record<string, unknown> | null = null;
  const db = makeDb({
    jobApplication: {
      ...(makeDb().jobApplication as Record<string, unknown>),
      findMany: async ({ where }: { where: Record<string, unknown> }) => {
        capturedWhere = where;

        return [
          {
            id: "app-saved",
            userId: "user-1",
            status: "SAVED",
            cvAdaptations: [],
          },
          {
            id: "app-analyzed",
            userId: "user-1",
            status: "ANALYZED",
            cvAdaptations: [
              {
                id: "adapt-1",
                createdAt: new Date("2026-05-01T10:00:00Z"),
                status: "delivered",
                adaptedResumeId: "resume-1",
                isUnlocked: true,
                adaptedContentJson: { scoreAfter: 82 },
              },
            ],
          },
          {
            id: "app-applied",
            userId: "user-1",
            status: "APPLIED",
            cvAdaptations: [
              {
                id: "adapt-2",
                createdAt: new Date("2026-05-02T10:00:00Z"),
                status: "delivered",
                adaptedResumeId: "resume-2",
                isUnlocked: true,
                adaptedContentJson: { scoreAfter: 76 },
              },
            ],
          },
          {
            id: "app-interview",
            userId: "user-1",
            status: "INTERVIEW",
            cvAdaptations: [
              {
                id: "adapt-3",
                createdAt: new Date("2026-05-03T10:00:00Z"),
                status: "delivered",
                adaptedResumeId: "resume-3",
                isUnlocked: true,
                adaptedContentJson: { scoreAfter: 79 },
              },
            ],
          },
          {
            id: "app-rejected",
            userId: "user-1",
            status: "REJECTED",
            cvAdaptations: [],
          },
        ];
      },
    },
  });

  const service = new JobApplicationsServiceCtor(db);
  const summary = await service.getHighlightsSummary("user-1");

  assert.deepEqual(capturedWhere, {
    userId: "user-1",
    archivedAt: null,
    deletedAt: null,
  });
  assert.equal(summary.activeApplicationsCount, 4);
  assert.equal(summary.analyzedCvsCount, 3);
  assert.equal(summary.averageScore, 79);
});

test("getHighlightsSummary active count does not depend on relevance ranking", async () => {
  const db = makeDb({
    jobApplication: {
      ...(makeDb().jobApplication as Record<string, unknown>),
      findMany: async () => [
        {
          id: "app-saved",
          userId: "user-1",
          status: "SAVED",
          cvAdaptations: [],
        },
        {
          id: "app-in-process",
          userId: "user-1",
          status: "IN_PROCESS",
          cvAdaptations: [],
        },
        {
          id: "app-rejected",
          userId: "user-1",
          status: "REJECTED",
          cvAdaptations: [],
        },
      ],
    },
  });

  const service = new JobApplicationsServiceCtor(db);
  (
    service as unknown as {
      relevanceGroupRank: (_status: string) => number;
    }
  ).relevanceGroupRank = () => 2;

  const summary = await service.getHighlightsSummary("user-1");

  assert.equal(summary.activeApplicationsCount, 2);
});

test("getHighlightsSummary counts persisted scoreAfter only for legacy applications without adaptations", async () => {
  const db = makeDb({
    jobApplication: {
      ...(makeDb().jobApplication as Record<string, unknown>),
      findMany: async () => [
        {
          id: "app-empty-adaptations",
          userId: "user-1",
          status: "ANALYZED",
          scoreAfter: 84,
          cvAdaptations: [],
        },
        {
          id: "app-unresolved-adaptation",
          userId: "user-1",
          status: "CV_READY",
          scoreAfter: 76,
          cvAdaptations: [
            {
              id: "adapt-unresolved",
              createdAt: new Date("2026-05-04T10:00:00Z"),
              status: "delivered",
              adaptedResumeId: "resume-legacy",
              isUnlocked: true,
              adaptedContentJson: { summary: "missing score payload" },
            },
          ],
        },
      ],
    },
  });

  const service = new JobApplicationsServiceCtor(db);
  const summary = await service.getHighlightsSummary("user-1");

  assert.equal(summary.activeApplicationsCount, 2);
  assert.equal(summary.analyzedCvsCount, 2);
  assert.equal(summary.averageScore, 84);
});

test("getHighlightsSummary does not trust persisted scoreAfter when adaptations exist but cannot resolve a score", async () => {
  const db = makeDb({
    jobApplication: {
      ...(makeDb().jobApplication as Record<string, unknown>),
      findMany: async () => [
        {
          id: "app-stale-score",
          userId: "user-1",
          status: "CV_READY",
          scoreAfter: 91,
          cvAdaptations: [
            {
              id: "adapt-current",
              createdAt: new Date("2026-05-04T10:00:00Z"),
              status: "delivered",
              adaptedResumeId: "resume-current",
              isUnlocked: true,
              adaptedContentJson: { summary: "missing score payload" },
            },
          ],
        },
      ],
    },
  });

  const service = new JobApplicationsServiceCtor(db);
  const summary = await service.getHighlightsSummary("user-1");

  assert.equal(summary.activeApplicationsCount, 1);
  assert.equal(summary.analyzedCvsCount, 1);
  assert.equal(summary.averageScore, null);
});

test("getHighlightsSummary counts historical normalized-analysis payloads that web resolves", async () => {
  const db = makeDb({
    jobApplication: {
      ...(makeDb().jobApplication as Record<string, unknown>),
      findMany: async () => [
        {
          id: "app-historical-normalized-shape",
          userId: "user-1",
          status: "CV_READY",
          cvAdaptations: [
            {
              id: "adapt-historical-normalized-shape",
              createdAt: new Date("2026-05-04T10:00:00Z"),
              status: "delivered",
              adaptedResumeId: "resume-historical-normalized-shape",
              isUnlocked: true,
              adaptedContentJson: {
                vaga: { cargo: "Analista", empresa: "EarlyCV" },
                fit: {
                  score: 1,
                  categoria: "medio",
                  headline: "headline",
                  subheadline: "subheadline",
                },
                positivos: [{ texto: "xp relevante", pontos: 20 }],
                ajustes_conteudo: [
                  {
                    id: "a1",
                    titulo: "Ajustar bullets",
                    descricao: "",
                    pontos: 10,
                    dica: "",
                  },
                ],
                ajustes_indisponiveis: [
                  {
                    id: "i1",
                    titulo: "Sem ingles avancado",
                    descricao: "",
                    pontos: 10,
                    dica: "",
                  },
                ],
                keywords: {
                  presentes: [{ kw: "SQL", pontos: 25 }],
                  ausentes: [{ kw: "Python", pontos: 15 }],
                },
                formato_cv: {
                  resumo: "ok",
                  problemas: [
                    {
                      tipo: "atencao",
                      titulo: "Resumo longo",
                      descricao: "",
                      impacto: 4,
                    },
                  ],
                  campos: [
                    { nome: "Telefone", presente: false },
                    { nome: "LinkedIn", presente: false },
                    { nome: "Nome completo", presente: true },
                  ],
                },
                comparacao: { antes: "", depois: "" },
                pontos_fortes: [],
                lacunas: [],
                melhorias_aplicadas: [],
                ats_keywords: { presentes: [], ausentes: [] },
                preview: { antes: "", depois: "" },
                projecao_melhoria: {
                  score_atual: 88,
                  explicacao_curta: "",
                },
                mensagem_venda: { titulo: "", subtexto: "" },
              },
            },
          ],
        },
      ],
    },
  });

  const service = new JobApplicationsServiceCtor(db);
  const summary = await service.getHighlightsSummary("user-1");

  assert.equal(summary.activeApplicationsCount, 1);
  assert.equal(summary.analyzedCvsCount, 1);
  assert.equal(summary.averageScore, 68);
});

test("getById returns derived best-version fields", async () => {
  const db = makeDb({
    jobApplication: {
      ...(makeDb().jobApplication as Record<string, unknown>),
      findFirst: async () => ({
        id: "app-1",
        userId: "user-1",
        jobTitle: "Engenheiro",
        companyName: "Empresa",
        status: "ANALYZED",
        updatedAt: new Date("2026-05-02T12:00:00Z"),
        cvAdaptations: [
          {
            id: "a1",
            createdAt: new Date("2026-05-01T10:00:00Z"),
            status: "analyzing",
            adaptedResumeId: null,
            isUnlocked: false,
            adaptedContentJson: { scoreAfter: 81 },
          },
          {
            id: "a2",
            createdAt: new Date("2026-05-02T10:00:00Z"),
            status: "delivered",
            adaptedResumeId: "resume-1",
            isUnlocked: true,
            adaptedContentJson: { scoreAfter: 84 },
          },
        ],
        events: [],
        interviewPrep: null,
      }),
    },
  });

  const service = new JobApplicationsServiceCtor(db);
  const response = (await service.getById("user-1", "app-1")) as Record<
    string,
    unknown
  >;

  assert.equal(response.bestScore, 84);
  assert.equal(response.bestCvAdaptationId, "a2");
  assert.equal(response.bestCvState, "ready");
  assert.equal(response.scorePresentation, "scored");
});

test("getById keeps strict CV_READY precedence when scores tie", async () => {
  const db = makeDb({
    jobApplication: {
      ...(makeDb().jobApplication as Record<string, unknown>),
      findFirst: async () => ({
        id: "app-1",
        userId: "user-1",
        jobTitle: "Engenheiro",
        companyName: "Empresa",
        status: "ANALYZED",
        updatedAt: new Date("2026-05-02T12:00:00Z"),
        cvAdaptations: [
          {
            id: "a-regular",
            createdAt: new Date("2026-05-03T10:00:00Z"),
            status: "analyzing",
            adaptedResumeId: null,
            isUnlocked: false,
            adaptedContentJson: { scoreAfter: 82 },
          },
          {
            id: "a-ready",
            createdAt: new Date("2026-05-01T10:00:00Z"),
            status: "delivered",
            adaptedResumeId: "resume-1",
            isUnlocked: true,
            adaptedContentJson: { scoreAfter: 82 },
          },
        ],
        events: [],
        interviewPrep: null,
      }),
    },
  });

  const service = new JobApplicationsServiceCtor(db);
  const response = (await service.getById("user-1", "app-1")) as Record<
    string,
    unknown
  >;

  assert.equal(response.bestCvAdaptationId, "a-ready");
  assert.equal(response.bestScore, 82);
  assert.equal(response.bestCvState, "ready");
  assert.equal(response.scorePresentation, "scored");
});

test("archive and restore are idempotent and keep status unchanged", async () => {
  const db = makeDb();
  const apps = db._jobApplications as Map<string, Record<string, unknown>>;

  apps.set("app-archive", {
    id: "app-archive",
    userId: "user-1",
    jobTitle: "Role",
    companyName: "Company",
    normalizedJobTitle: "role",
    normalizedCompanyName: "company",
    status: "INTERVIEW",
    archivedAt: null,
    deletedAt: null,
    cvAdaptations: [],
    events: [],
    interviewPrep: null,
  });

  const service = new JobApplicationsServiceCtor(db);

  await service.archive("user-1", "app-archive");
  const afterArchive = apps.get("app-archive");
  assert.equal(afterArchive?.status, "INTERVIEW");
  assert.ok(afterArchive?.archivedAt instanceof Date);

  await service.archive("user-1", "app-archive");
  const afterArchiveAgain = apps.get("app-archive");
  assert.equal(afterArchiveAgain?.status, "INTERVIEW");
  assert.ok(afterArchiveAgain?.archivedAt instanceof Date);

  await service.restore("user-1", "app-archive");
  const afterRestore = apps.get("app-archive");
  assert.equal(afterRestore?.status, "INTERVIEW");
  assert.equal(afterRestore?.archivedAt, null);

  await service.restore("user-1", "app-archive");
  const afterRestoreAgain = apps.get("app-archive");
  assert.equal(afterRestoreAgain?.status, "INTERVIEW");
  assert.equal(afterRestoreAgain?.archivedAt, null);
});

test("status changed while archived persists after restore", async () => {
  const db = makeDb();
  const apps = db._jobApplications as Map<string, Record<string, unknown>>;

  apps.set("app-archived", {
    id: "app-archived",
    userId: "user-1",
    jobTitle: "Role",
    companyName: "Company",
    normalizedJobTitle: "role",
    normalizedCompanyName: "company",
    status: "APPLIED",
    archivedAt: null,
    deletedAt: null,
    cvAdaptations: [],
    events: [],
    interviewPrep: null,
  });

  const service = new JobApplicationsServiceCtor(db);

  await service.archive("user-1", "app-archived");
  await service.updateStatus("user-1", "app-archived", "INTERVIEW");
  await service.restore("user-1", "app-archived");

  const app = apps.get("app-archived");
  assert.equal(app?.status, "INTERVIEW");
  assert.equal(app?.archivedAt, null);
});

test("deleted applications are treated as not found in user-facing reads", async () => {
  const db = makeDb();
  const apps = db._jobApplications as Map<string, Record<string, unknown>>;

  apps.set("app-deleted", {
    id: "app-deleted",
    userId: "user-1",
    jobTitle: "Role",
    companyName: "Company",
    normalizedJobTitle: "role",
    normalizedCompanyName: "company",
    status: "INTERVIEW",
    archivedAt: null,
    deletedAt: new Date("2026-01-01T00:00:00Z"),
    cvAdaptations: [],
    events: [],
    interviewPrep: null,
  });

  const service = new JobApplicationsServiceCtor(db);

  await assert.rejects(
    () => service.getById("user-1", "app-deleted"),
    /job application not found/,
  );
  await assert.rejects(
    () => service.archive("user-1", "app-deleted"),
    /job application not found/,
  );
  await assert.rejects(
    () => service.restore("user-1", "app-deleted"),
    /job application not found/,
  );
});

test("delete marks deletedAt when archived and no unlocked adaptation", async () => {
  const db = makeDb();
  const apps = db._jobApplications as Map<string, Record<string, unknown>>;

  apps.set("app-eligible", {
    id: "app-eligible",
    userId: "user-1",
    status: "INTERVIEW",
    archivedAt: new Date("2026-01-02T00:00:00.000Z"),
    deletedAt: null,
  });

  const service = new JobApplicationsServiceCtor(db);

  await service.delete("user-1", "app-eligible");

  const app = apps.get("app-eligible");
  assert.ok(app?.deletedAt instanceof Date);
});

test("delete rejects when application is not archived", async () => {
  const db = makeDb();
  const apps = db._jobApplications as Map<string, Record<string, unknown>>;

  apps.set("app-active", {
    id: "app-active",
    userId: "user-1",
    status: "INTERVIEW",
    archivedAt: null,
    deletedAt: null,
  });

  const service = new JobApplicationsServiceCtor(db);

  await assert.rejects(
    () => service.delete("user-1", "app-active"),
    (error: unknown) =>
      error instanceof ConflictException && error.message.includes("arquivada"),
  );
});

test("delete rejects when there is unlocked adaptation", async () => {
  const db = makeDb();
  const apps = db._jobApplications as Map<string, Record<string, unknown>>;
  const adaptations = db._cvAdaptations as Map<string, Record<string, unknown>>;

  apps.set("app-with-unlocked", {
    id: "app-with-unlocked",
    userId: "user-1",
    status: "INTERVIEW",
    archivedAt: new Date("2026-01-02T00:00:00.000Z"),
    deletedAt: null,
  });
  adaptations.set("adapt-unlocked", {
    id: "adapt-unlocked",
    jobApplicationId: "app-with-unlocked",
    isUnlocked: true,
    status: "delivered",
  });

  const service = new JobApplicationsServiceCtor(db);

  await assert.rejects(
    () => service.delete("user-1", "app-with-unlocked"),
    (error: unknown) =>
      error instanceof ConflictException &&
      error.message.includes("CV liberado"),
  );
});

test("splitAnalysisIntoNewApplication moves adaptation and repoints current IDs", async () => {
  const db = makeDb();
  const apps = db._jobApplications as Map<string, Record<string, unknown>>;
  const adaptations = db._cvAdaptations as Map<string, Record<string, unknown>>;

  apps.set("app-source", {
    id: "app-source",
    userId: "user-1",
    jobTitle: "Source role",
    companyName: "Source company",
    normalizedJobTitle: "source role",
    normalizedCompanyName: "source company",
    jobDescriptionText: "source desc",
    status: "CV_READY",
    origin: "analysis_auto",
    currentCvAdaptationId: "adapt-separate",
  });

  adaptations.set("adapt-separate", {
    id: "adapt-separate",
    userId: "user-1",
    jobApplicationId: "app-source",
    status: "delivered",
    isUnlocked: true,
    jobTitle: "New role",
    companyName: "New company",
    jobDescriptionText: "new desc",
    createdAt: new Date("2026-05-30T10:00:00.000Z"),
    adaptedContentJson: { scoreBefore: 51, scoreAfter: 79 },
  });
  adaptations.set("adapt-remaining", {
    id: "adapt-remaining",
    userId: "user-1",
    jobApplicationId: "app-source",
    createdAt: new Date("2026-05-29T10:00:00.000Z"),
  });

  const service = new JobApplicationsServiceCtor(db);
  const created = await service.splitAnalysisIntoNewApplication(
    "user-1",
    "app-source",
    "adapt-separate",
  );

  const source = apps.get("app-source");
  assert.equal(source?.currentCvAdaptationId, "adapt-remaining");

  const moved = adaptations.get("adapt-separate");
  assert.equal(moved?.jobApplicationId, created.newApplicationId);

  const createdApp = apps.get(created.newApplicationId);
  assert.equal(createdApp?.currentCvAdaptationId, "adapt-separate");
  assert.equal(createdApp?.jobTitle, "New role");
  assert.equal(createdApp?.companyName, "New company");
  assert.equal(createdApp?.status, "CV_READY");

  const events = db._createdEvents as Array<{ jobApplicationId: string }>;
  assert.equal(events.length, 2);
  assert.ok(events.some((event) => event.jobApplicationId === "app-source"));
  assert.ok(
    events.some((event) => event.jobApplicationId === created.newApplicationId),
  );
});

test("splitAnalysisIntoNewApplication nulls source pointer when no remaining adaptations", async () => {
  const db = makeDb();
  const apps = db._jobApplications as Map<string, Record<string, unknown>>;
  const adaptations = db._cvAdaptations as Map<string, Record<string, unknown>>;

  apps.set("app-source", {
    id: "app-source",
    userId: "user-1",
    jobTitle: "Source role",
    companyName: "Source company",
    normalizedJobTitle: "source role",
    normalizedCompanyName: "source company",
    status: "ANALYZED",
    origin: "analysis_auto",
    currentCvAdaptationId: "adapt-separate",
  });

  adaptations.set("adapt-separate", {
    id: "adapt-separate",
    userId: "user-1",
    jobApplicationId: "app-source",
    status: "analyzing",
    isUnlocked: false,
    jobTitle: "Only role",
    companyName: "Only company",
    createdAt: new Date("2026-05-30T10:00:00.000Z"),
    adaptedContentJson: { scoreAfter: 74 },
  });

  const service = new JobApplicationsServiceCtor(db);
  const created = await service.splitAnalysisIntoNewApplication(
    "user-1",
    "app-source",
    "adapt-separate",
  );

  const source = apps.get("app-source");
  assert.equal(source?.currentCvAdaptationId, null);

  const createdApp = apps.get(created.newApplicationId);
  assert.equal(createdApp?.status, "ANALYZED");
});

test("splitAnalysisIntoNewApplication validates ownership and adaptation belonging", async () => {
  const db = makeDb();
  const apps = db._jobApplications as Map<string, Record<string, unknown>>;
  const adaptations = db._cvAdaptations as Map<string, Record<string, unknown>>;

  apps.set("app-source", {
    id: "app-source",
    userId: "user-1",
    jobTitle: "Source role",
    companyName: "Source company",
    normalizedJobTitle: "source role",
    normalizedCompanyName: "source company",
    status: "ANALYZED",
    origin: "analysis_auto",
    currentCvAdaptationId: "adapt-separate",
  });

  adaptations.set("adapt-separate", {
    id: "adapt-separate",
    userId: "user-1",
    jobApplicationId: "another-app",
    jobTitle: "Only role",
    companyName: "Only company",
    createdAt: new Date("2026-05-30T10:00:00.000Z"),
    adaptedContentJson: { scoreAfter: 74 },
  });

  const service = new JobApplicationsServiceCtor(db);

  await assert.rejects(
    () =>
      service.splitAnalysisIntoNewApplication(
        "user-2",
        "app-source",
        "adapt-separate",
      ),
    /not found/i,
  );

  await assert.rejects(
    () =>
      service.splitAnalysisIntoNewApplication(
        "user-1",
        "app-source",
        "adapt-separate",
      ),
    /does not belong/i,
  );

  adaptations.set("adapt-separate", {
    id: "adapt-separate",
    userId: "user-2",
    jobApplicationId: "app-source",
    jobTitle: "Only role",
    companyName: "Only company",
    createdAt: new Date("2026-05-30T10:00:00.000Z"),
    adaptedContentJson: { scoreAfter: 74 },
  });

  await assert.rejects(
    () =>
      service.splitAnalysisIntoNewApplication(
        "user-1",
        "app-source",
        "adapt-separate",
      ),
    /not found/i,
  );
});
