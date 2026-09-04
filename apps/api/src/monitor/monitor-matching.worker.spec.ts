import assert from "node:assert/strict";
import { test } from "node:test";

import { MatchingEngine } from "../radar/matching.engine";
import { MonitorMatchingWorker } from "./monitor-matching.worker";

type ProfileRecord = {
  userId: string;
  areas: string[];
  seniority: string;
  skills: string[];
  technologies: string[];
  languages: string[];
  preferredWorkModels: string[];
};

type JobRecord = {
  id: string;
  status: string;
  workModel: string | null;
  enrichment: {
    enrichmentStatus: string;
    dominantArea: string | null;
    areas: string[];
    requiredSkills: string[];
    technologies: string[];
    seniority: string | null;
    languageRequirements: string[];
  } | null;
};

function createFixture() {
  const jobs = new Map<string, JobRecord>();
  const profiles = new Map<string, ProfileRecord>();
  const recommendations = new Map<
    string,
    {
      id: string;
      userId: string;
      jobId: string;
      score: number;
      opportunityLevel: number;
      viewedAt: Date | null;
      dismissedAt: Date | null;
    }
  >();
  const matchJobs = new Map<
    string,
    { id: string; jobId: string; status: string; attempts: number }
  >();
  const findManyProfileWhereCalls: unknown[] = [];

  function matchesWhere(
    profile: ProfileRecord,
    where: Record<string, unknown>,
  ) {
    const areasFilter = where.areas as { hasSome: string[] } | undefined;
    if (
      areasFilter &&
      !profile.areas.some((a) => areasFilter.hasSome.includes(a))
    ) {
      return false;
    }
    const seniorityFilter = where.seniority as { in: string[] } | undefined;
    if (seniorityFilter && !seniorityFilter.in.includes(profile.seniority)) {
      return false;
    }
    return true;
  }

  const database = {
    job: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        jobs.get(where.id) ?? null,
    },
    userRadarProfile: {
      findMany: async ({ where }: { where: Record<string, unknown> }) => {
        findManyProfileWhereCalls.push(where);
        return Array.from(profiles.values()).filter((p) =>
          matchesWhere(p, where),
        );
      },
    },
    userJobRecommendation: {
      upsert: async ({
        where,
        create,
        update,
      }: {
        where: { userId_jobId: { userId: string; jobId: string } };
        create: Record<string, unknown>;
        update: Record<string, unknown>;
      }) => {
        const key = `${where.userId_jobId.userId}:${where.userId_jobId.jobId}`;
        const existing = recommendations.get(key);
        if (existing) {
          const next = { ...existing, ...update };
          recommendations.set(key, next);
          return next;
        }
        const next = {
          id: `rec-${key}`,
          userId: where.userId_jobId.userId,
          jobId: where.userId_jobId.jobId,
          score: create.score as number,
          opportunityLevel: create.opportunityLevel as number,
          viewedAt: null,
          dismissedAt: null,
        };
        recommendations.set(key, next);
        return next;
      },
    },
    monitorMatchJob: {
      findMany: async () => [],
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: Record<string, unknown>;
      }) => {
        const current = matchJobs.get(where.id);
        assert.ok(current, `match job ${where.id} must exist`);
        const next = { ...current, ...data };
        matchJobs.set(where.id, next);
        return next;
      },
    },
  };

  const lockRepository = {
    acquire: async () => true,
    release: async () => undefined,
  };

  let deniedUserIds = new Set<string>();
  const entitlementService = {
    filterEntitledUserIds: async (userIds: string[]) =>
      new Set(userIds.filter((id) => !deniedUserIds.has(id))),
  };

  const matchingEngine = new MatchingEngine(database as never);
  const worker = new MonitorMatchingWorker(
    database as never,
    lockRepository as never,
    matchingEngine,
    entitlementService as never,
  );

  function seedJob(overrides: Partial<JobRecord> = {}) {
    const id = overrides.id ?? `job-${jobs.size + 1}`;
    const record: JobRecord = {
      id,
      status: "active",
      workModel: "remote",
      enrichment: {
        enrichmentStatus: "COMPLETED",
        dominantArea: "SOFTWARE_ENGINEERING",
        areas: ["SOFTWARE_ENGINEERING"],
        requiredSkills: ["typescript"],
        technologies: ["typescript"],
        seniority: "SENIOR",
        languageRequirements: [],
      },
      ...overrides,
    };
    jobs.set(id, record);
    return record;
  }

  function seedProfile(overrides: Partial<ProfileRecord> = {}) {
    const userId = overrides.userId ?? `user-${profiles.size + 1}`;
    const record: ProfileRecord = {
      userId,
      areas: ["SOFTWARE_ENGINEERING"],
      seniority: "SENIOR",
      skills: ["typescript"],
      technologies: ["typescript"],
      languages: [],
      preferredWorkModels: [],
      ...overrides,
    };
    profiles.set(userId, record);
    return record;
  }

  function seedMatchJob(jobId: string) {
    const id = `match-job-${jobId}`;
    matchJobs.set(id, { id, jobId, status: "PENDING", attempts: 0 });
    return { id, jobId };
  }

  return {
    database,
    findManyProfileWhereCalls,
    matchJobs,
    recommendations,
    seedJob,
    seedMatchJob,
    seedProfile,
    setDeniedUserIds(userIds: string[]) {
      deniedUserIds = new Set(userIds);
    },
    worker,
  };
}

test("MonitorMatchingWorker persists a UserJobRecommendation for a candidate that scores level 3+", async () => {
  const fixture = createFixture();
  const job = fixture.seedJob();
  fixture.seedProfile({ userId: "user-1" });

  const matchJob = fixture.seedMatchJob(job.id);
  // @ts-expect-error acessa o método privado da classe apenas em teste
  await fixture.worker.processJob(matchJob);

  const stored = fixture.recommendations.get(`user-1:${job.id}`);
  assert.ok(stored, "expected a recommendation to be persisted");
  assert.ok(stored && stored.opportunityLevel >= 3);
});

test("MonitorMatchingWorker does not persist a recommendation for a candidate that scores below level 3", async () => {
  const fixture = createFixture();
  const job = fixture.seedJob();
  // Área bate (passa no pré-filtro), mas senioridade distante (2 níveis) e
  // nenhuma skill/tecnologia em comum — soma fica abaixo de 55 (nível 3).
  fixture.seedProfile({
    userId: "user-2",
    areas: ["SOFTWARE_ENGINEERING"],
    seniority: "JUNIOR",
    skills: [],
    technologies: [],
    languages: [],
    preferredWorkModels: [],
  });

  const matchJob = fixture.seedMatchJob(job.id);
  // @ts-expect-error acessa o método privado da classe apenas em teste
  await fixture.worker.processJob(matchJob);

  assert.equal(fixture.recommendations.get(`user-2:${job.id}`), undefined);
});

test("MonitorMatchingWorker upserts idempotently — reprocessar a mesma vaga não duplica a recomendação nem apaga viewedAt/dismissedAt", async () => {
  const fixture = createFixture();
  const job = fixture.seedJob();
  fixture.seedProfile({ userId: "user-1" });

  const key = `user-1:${job.id}`;
  const matchJob1 = fixture.seedMatchJob(job.id);
  // @ts-expect-error acessa método privado só em teste
  await fixture.worker.processJob(matchJob1);
  assert.equal(fixture.recommendations.size, 1);

  // Simula que o usuário já viu a recomendação antes de a vaga ser
  // reprocessada (ex: "Forçar LLM").
  const existing = fixture.recommendations.get(key);
  assert.ok(existing);
  if (existing) {
    fixture.recommendations.set(key, { ...existing, viewedAt: new Date() });
  }

  const matchJob2 = fixture.seedMatchJob(job.id);
  // @ts-expect-error acessa método privado só em teste
  await fixture.worker.processJob(matchJob2);

  assert.equal(
    fixture.recommendations.size,
    1,
    "must not duplicate the recommendation",
  );
  const after = fixture.recommendations.get(key);
  assert.ok(after?.viewedAt, "viewedAt must survive a reprocessing upsert");
});

test("MonitorMatchingWorker's prefilter queries UserRadarProfile by area/seniority instead of loading every profile", async () => {
  const fixture = createFixture();
  const job = fixture.seedJob({
    enrichment: {
      enrichmentStatus: "COMPLETED",
      dominantArea: "DATA_AI",
      areas: ["DATA_AI"],
      requiredSkills: ["python"],
      technologies: ["python"],
      seniority: "SENIOR",
      languageRequirements: [],
    },
  });
  fixture.seedProfile({
    userId: "compatible",
    areas: ["DATA_AI"],
    seniority: "SENIOR",
  });
  fixture.seedProfile({
    userId: "incompatible",
    areas: ["DESIGN_UX"],
    seniority: "INTERN",
  });

  const matchJob = fixture.seedMatchJob(job.id);
  // @ts-expect-error acessa método privado só em teste
  await fixture.worker.processJob(matchJob);

  assert.ok(fixture.findManyProfileWhereCalls.length > 0);
  const where = fixture.findManyProfileWhereCalls[0] as {
    areas?: { hasSome: string[] };
  };
  assert.ok(where.areas?.hasSome.includes("DATA_AI"));
  // O perfil DESIGN_UX/INTERN nunca deveria ter sido considerado candidato.
  assert.equal(
    fixture.recommendations.get(`incompatible:${job.id}`),
    undefined,
  );
});

test("MonitorMatchingWorker marks the MonitorMatchJob COMPLETED with the matched count", async () => {
  const fixture = createFixture();
  const job = fixture.seedJob();
  fixture.seedProfile({ userId: "user-1" });

  const matchJob = fixture.seedMatchJob(job.id);
  // @ts-expect-error acessa método privado só em teste
  await fixture.worker.processJob(matchJob);

  const stored = fixture.matchJobs.get(matchJob.id);
  assert.equal(stored?.status, "COMPLETED");
});

test("MonitorMatchingWorker never creates a new recommendation for a user without Monitor entitlement", async () => {
  const fixture = createFixture();
  const job = fixture.seedJob();
  fixture.seedProfile({ userId: "user-1" });
  fixture.setDeniedUserIds(["user-1"]);

  const matchJob = fixture.seedMatchJob(job.id);
  // @ts-expect-error acessa método privado só em teste
  await fixture.worker.processJob(matchJob);

  assert.equal(fixture.recommendations.size, 0);
});

test("entitlement is filtered per candidate — an entitled user still gets matched even when another candidate is denied", async () => {
  const fixture = createFixture();
  const job = fixture.seedJob();
  fixture.seedProfile({ userId: "user-allowed" });
  fixture.seedProfile({ userId: "user-denied" });
  fixture.setDeniedUserIds(["user-denied"]);

  const matchJob = fixture.seedMatchJob(job.id);
  // @ts-expect-error acessa método privado só em teste
  await fixture.worker.processJob(matchJob);

  assert.equal(fixture.recommendations.size, 1);
  assert.ok(fixture.recommendations.get(`user-allowed:${job.id}`));
  assert.equal(fixture.recommendations.get(`user-denied:${job.id}`), undefined);
});
