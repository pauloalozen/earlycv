import assert from "node:assert/strict";
import { test } from "node:test";

import { MatchingEngine } from "../radar/matching.engine";
import { MonitorProfileMatchingWorker } from "./monitor-profile-matching.worker";

type ProfileRecord = {
  userId: string;
  areas: string[];
  seniority: string;
  skills: string[];
  technologies: string[];
  languages: string[];
  preferredWorkModels: string[];
  matchFingerprint: string | null;
  lastMatchedAt: Date | null;
  monitorStatus: string;
};

type JobRecord = {
  id: string;
  status: string;
  workModel: string | null;
  firstSeenAt: Date;
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

type RecommendationRecord = {
  id: string;
  userId: string;
  jobId: string;
  score: number;
  opportunityLevel: number;
  viewedAt: Date | null;
  dismissedAt: Date | null;
  supersededAt: Date | null;
  recommendedAt: Date;
};

type MatchJobRecord = {
  id: string;
  userId: string;
  status: string;
  attempts: number;
  updatedAt: Date;
};

function createFixture() {
  const jobs = new Map<string, JobRecord>();
  const profiles = new Map<string, ProfileRecord>();
  const recommendations = new Map<string, RecommendationRecord>();
  const matchJobs = new Map<string, MatchJobRecord>();
  let nextRecId = 1;
  // Chamado toda vez que o worker relê o UserRadarProfile (início e fim de
  // matchProfileAgainstJobs) — usado pelo teste de "duas edições rápidas"
  // para simular uma edição concorrente acontecendo entre a primeira e a
  // segunda leitura, sem precisar acessar campos privados do worker.
  let onProfileRead: (() => void) | null = null;

  function matchesJobWhere(job: JobRecord, where: Record<string, unknown>) {
    if (where.status && job.status !== where.status) return false;
    const firstSeenAtFilter = where.firstSeenAt as { gte: Date } | undefined;
    if (firstSeenAtFilter && job.firstSeenAt < firstSeenAtFilter.gte) {
      return false;
    }
    const enrichmentWhere = where.enrichment as
      | Record<string, unknown>
      | undefined;
    if (enrichmentWhere) {
      if (!job.enrichment) return false;
      if (
        enrichmentWhere.enrichmentStatus &&
        job.enrichment.enrichmentStatus !== enrichmentWhere.enrichmentStatus
      ) {
        return false;
      }
      const dominantAreaFilter = enrichmentWhere.dominantArea as
        | { not: string }
        | undefined;
      if (
        dominantAreaFilter &&
        job.enrichment.dominantArea === dominantAreaFilter.not
      ) {
        return false;
      }
      const areasFilter = enrichmentWhere.areas as
        | { hasSome: string[] }
        | undefined;
      if (
        areasFilter &&
        !job.enrichment.areas.some((a) => areasFilter.hasSome.includes(a))
      ) {
        return false;
      }
      const seniorityFilter = enrichmentWhere.seniority as
        | { in: string[] }
        | undefined;
      if (
        seniorityFilter &&
        !seniorityFilter.in.includes(job.enrichment.seniority as string)
      ) {
        return false;
      }
    }
    const recommendationsFilter = where.recommendations as
      | { none: { userId: string } }
      | undefined;
    if (recommendationsFilter) {
      const alreadyRecommended = Array.from(recommendations.values()).some(
        (r) =>
          r.jobId === job.id && r.userId === recommendationsFilter.none.userId,
      );
      if (alreadyRecommended) return false;
    }
    return true;
  }

  const database = {
    job: {
      findMany: async ({
        where,
        take,
      }: {
        where: Record<string, unknown>;
        take?: number;
      }) =>
        Array.from(jobs.values())
          .filter((j) => matchesJobWhere(j, where))
          .sort((a, b) => b.firstSeenAt.getTime() - a.firstSeenAt.getTime())
          .slice(0, take),
    },
    userRadarProfile: {
      findUnique: async ({ where }: { where: { userId: string } }) => {
        const value = profiles.get(where.userId) ?? null;
        onProfileRead?.();
        return value;
      },
      update: async ({
        where,
        data,
      }: {
        where: { userId: string };
        data: Record<string, unknown>;
      }) => {
        const current = profiles.get(where.userId);
        assert.ok(current, `profile ${where.userId} must exist`);
        const next = { ...current, ...data } as ProfileRecord;
        profiles.set(where.userId, next);
        return next;
      },
    },
    userJobRecommendation: {
      findMany: async ({
        where,
        take,
      }: {
        where: { userId: string; dismissedAt: null };
        take?: number;
      }) =>
        Array.from(recommendations.values())
          .filter(
            (r) =>
              r.userId === where.userId && r.dismissedAt === where.dismissedAt,
          )
          .sort((a, b) => b.recommendedAt.getTime() - a.recommendedAt.getTime())
          .slice(0, take)
          .map((r) => ({ ...r, job: jobs.get(r.jobId) })),
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: Record<string, unknown>;
      }) => {
        const current = recommendations.get(where.id);
        assert.ok(current, `recommendation ${where.id} must exist`);
        const next = { ...current, ...data } as RecommendationRecord;
        recommendations.set(where.id, next);
        return next;
      },
      upsert: async ({
        where,
        create,
        update,
      }: {
        where: { userId_jobId: { userId: string; jobId: string } };
        create: Record<string, unknown>;
        update: Record<string, unknown>;
      }) => {
        const existing = Array.from(recommendations.values()).find(
          (r) =>
            r.userId === where.userId_jobId.userId &&
            r.jobId === where.userId_jobId.jobId,
        );
        if (existing) {
          const next = { ...existing, ...update } as RecommendationRecord;
          recommendations.set(existing.id, next);
          return next;
        }
        const id = `rec-${nextRecId++}`;
        const next: RecommendationRecord = {
          id,
          userId: where.userId_jobId.userId,
          jobId: where.userId_jobId.jobId,
          score: create.score as number,
          opportunityLevel: create.opportunityLevel as number,
          viewedAt: null,
          dismissedAt: null,
          supersededAt: null,
          recommendedAt: new Date(),
        };
        recommendations.set(id, next);
        return next;
      },
    },
    monitorProfileMatchJob: {
      findMany: async ({ where }: { where: { status: string } }) =>
        Array.from(matchJobs.values()).filter((j) => j.status === where.status),
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: Record<string, unknown>;
      }) => {
        const current = matchJobs.get(where.id);
        assert.ok(current, `match job ${where.id} must exist`);
        const next = { ...current, ...data, updatedAt: new Date() };
        matchJobs.set(where.id, next);
        return next;
      },
    },
  };

  const lockRepository = {
    acquire: async () => true,
    release: async () => undefined,
  };

  let entitled = true;
  const entitlementService = {
    canUseMonitor: async () => ({
      allowed: entitled,
      reason: entitled ? "internal_access" : "none",
    }),
  };

  const matchingEngine = new MatchingEngine(database as never);
  const worker = new MonitorProfileMatchingWorker(
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
      firstSeenAt: new Date(),
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
    const userId = overrides.userId ?? "user-1";
    const record: ProfileRecord = {
      userId,
      areas: ["SOFTWARE_ENGINEERING"],
      seniority: "SENIOR",
      skills: ["typescript"],
      technologies: ["typescript"],
      languages: [],
      preferredWorkModels: [],
      matchFingerprint: null,
      lastMatchedAt: null,
      monitorStatus: "INITIALIZING",
      ...overrides,
    };
    profiles.set(userId, record);
    return record;
  }

  function seedRecommendation(overrides: Partial<RecommendationRecord> = {}) {
    const id = overrides.id ?? `rec-${nextRecId++}`;
    const record: RecommendationRecord = {
      id,
      userId: "user-1",
      jobId: "job-1",
      score: 80,
      opportunityLevel: 4,
      viewedAt: null,
      dismissedAt: null,
      supersededAt: null,
      recommendedAt: new Date(),
      ...overrides,
    };
    recommendations.set(id, record);
    return record;
  }

  function seedMatchJob(
    userId: string,
    overrides: Partial<MatchJobRecord> = {},
  ) {
    const id = overrides.id ?? `match-job-${userId}`;
    const record: MatchJobRecord = {
      id,
      userId,
      status: "PENDING",
      attempts: 0,
      updatedAt: new Date(),
      ...overrides,
    };
    matchJobs.set(id, record);
    return record;
  }

  return {
    jobs,
    matchJobs,
    profiles,
    recommendations,
    seedJob,
    seedMatchJob,
    seedProfile,
    seedRecommendation,
    setEntitled(value: boolean) {
      entitled = value;
    },
    setOnProfileRead(fn: (() => void) | null) {
      onProfileRead = fn;
    },
    worker,
  };
}

test("MonitorProfileMatchingWorker (backfill): a new user gets recommendations from jobs already in the base", async () => {
  const fixture = createFixture();
  fixture.seedProfile();
  fixture.seedJob({ id: "job-1" });

  const matchJob = fixture.seedMatchJob("user-1");
  // @ts-expect-error acessa método privado só em teste
  await fixture.worker.processJob(matchJob);

  const recs = Array.from(fixture.recommendations.values());
  assert.equal(recs.length, 1);
  assert.equal(recs[0].jobId, "job-1");
  assert.ok(recs[0].opportunityLevel >= 3);
});

test("MonitorProfileMatchingWorker's backfill does not duplicate a recommendation on repeated runs", async () => {
  const fixture = createFixture();
  fixture.seedProfile();
  fixture.seedJob({ id: "job-1" });

  const matchJob1 = fixture.seedMatchJob("user-1");
  // @ts-expect-error acessa método privado só em teste
  await fixture.worker.processJob(matchJob1);
  const matchJob2 = fixture.seedMatchJob("user-1", {
    id: "match-job-user-1-2",
  });
  // @ts-expect-error acessa método privado só em teste
  await fixture.worker.processJob(matchJob2);

  assert.equal(fixture.recommendations.size, 1);
});

test("MonitorProfileMatchingWorker's backfill excludes jobs outside the 30-day window", async () => {
  const fixture = createFixture();
  fixture.seedProfile();
  const old = new Date();
  old.setDate(old.getDate() - 45);
  fixture.seedJob({ id: "job-old", firstSeenAt: old });
  fixture.seedJob({ id: "job-recent", firstSeenAt: new Date() });

  const matchJob = fixture.seedMatchJob("user-1");
  // @ts-expect-error acessa método privado só em teste
  await fixture.worker.processJob(matchJob);

  const jobIds = Array.from(fixture.recommendations.values()).map(
    (r) => r.jobId,
  );
  assert.deepEqual(jobIds, ["job-recent"]);
});

test("MonitorProfileMatchingWorker's backfill excludes inactive jobs", async () => {
  const fixture = createFixture();
  fixture.seedProfile();
  fixture.seedJob({ id: "job-inactive", status: "inactive" });

  const matchJob = fixture.seedMatchJob("user-1");
  // @ts-expect-error acessa método privado só em teste
  await fixture.worker.processJob(matchJob);

  assert.equal(fixture.recommendations.size, 0);
});

test("MonitorProfileMatchingWorker (rematch): a profile edit that widens compatibility finds new opportunities", async () => {
  const fixture = createFixture();
  fixture.seedProfile({ areas: ["DESIGN_UX"] });
  fixture.seedJob({ id: "job-1" }); // SOFTWARE_ENGINEERING — não bate ainda

  const matchJob1 = fixture.seedMatchJob("user-1");
  // @ts-expect-error acessa método privado só em teste
  await fixture.worker.processJob(matchJob1);
  assert.equal(fixture.recommendations.size, 0);

  // Usuário edita o perfil para incluir a área da vaga.
  const profile = fixture.profiles.get("user-1");
  assert.ok(profile);
  fixture.profiles.set("user-1", {
    ...profile,
    areas: ["SOFTWARE_ENGINEERING"],
  });

  const matchJob2 = fixture.seedMatchJob("user-1", {
    id: "match-job-user-1-2",
  });
  // @ts-expect-error acessa método privado só em teste
  await fixture.worker.processJob(matchJob2);

  assert.equal(fixture.recommendations.size, 1);
  assert.equal(Array.from(fixture.recommendations.values())[0].jobId, "job-1");
});

test("MonitorProfileMatchingWorker (rematch): an opportunity that stopped matching is superseded, not deleted, and disappears from the active feed", async () => {
  const fixture = createFixture();
  fixture.seedProfile({ areas: ["SOFTWARE_ENGINEERING"] });
  fixture.seedJob({ id: "job-1" });
  fixture.seedRecommendation({
    id: "rec-1",
    jobId: "job-1",
    opportunityLevel: 4,
  });

  // Perfil muda de área e perde as skills/tecnologias que sustentavam o
  // score alto — job-1 deixa de ser aderente (score cai bem abaixo de 55).
  const profile = fixture.profiles.get("user-1");
  assert.ok(profile);
  fixture.profiles.set("user-1", {
    ...profile,
    areas: ["DESIGN_UX"],
    skills: [],
    technologies: [],
  });

  const matchJob = fixture.seedMatchJob("user-1");
  // @ts-expect-error acessa método privado só em teste
  await fixture.worker.processJob(matchJob);

  const rec = fixture.recommendations.get("rec-1");
  assert.ok(rec?.supersededAt instanceof Date);
  // A linha não foi apagada — histórico preservado.
  assert.equal(fixture.recommendations.size, 1);
});

test("MonitorProfileMatchingWorker un-supersedes a recommendation that becomes valid again, but never reactivates a dismissed one", async () => {
  const fixture = createFixture();
  fixture.seedProfile({ areas: ["SOFTWARE_ENGINEERING"] });
  fixture.seedJob({ id: "job-1" });
  fixture.seedJob({ id: "job-2" });
  fixture.seedRecommendation({
    id: "rec-superseded",
    jobId: "job-1",
    supersededAt: new Date("2026-01-01T00:00:00Z"),
  });
  fixture.seedRecommendation({
    id: "rec-dismissed",
    jobId: "job-2",
    dismissedAt: new Date("2026-01-01T00:00:00Z"),
  });

  const matchJob = fixture.seedMatchJob("user-1");
  // @ts-expect-error acessa método privado só em teste
  await fixture.worker.processJob(matchJob);

  assert.equal(
    fixture.recommendations.get("rec-superseded")?.supersededAt,
    null,
  );
  // dismissed nunca é tocada pela reconciliação (dismissedAt: null no filtro).
  assert.ok(
    fixture.recommendations.get("rec-dismissed")?.dismissedAt instanceof Date,
  );
});

test("MonitorProfileMatchingWorker: a profile change mid-run leaves the job unmarked-as-matched instead of letting a stale result win", async () => {
  const fixture = createFixture();
  const profile = fixture.seedProfile({ areas: ["SOFTWARE_ENGINEERING"] });
  fixture.seedJob({ id: "job-1" });

  let reads = 0;
  fixture.setOnProfileRead(() => {
    reads += 1;
    if (reads === 1) {
      // Uma segunda edição de perfil acontece DEPOIS que o worker já leu o
      // perfil pela primeira vez (início do matching) mas ANTES da
      // releitura final de consistência.
      fixture.profiles.set("user-1", { ...profile, areas: ["DATA_AI"] });
    }
  });

  const matchJob = fixture.seedMatchJob("user-1");
  // @ts-expect-error acessa método privado só em teste
  await fixture.worker.processJob(matchJob);

  const finalProfile = fixture.profiles.get("user-1");
  assert.equal(finalProfile?.matchFingerprint, null);
  assert.equal(finalProfile?.lastMatchedAt, null);
  // O MonitorMatchJob ainda é considerado concluído nesta passada (o
  // trabalho em si terminou) — o próximo enqueueRematch/visita ao Monitor é
  // quem vai reprocessar com a versão mais nova do perfil.
  assert.equal(fixture.matchJobs.get(matchJob.id)?.status, "COMPLETED");
});

test("MonitorProfileMatchingWorker recovers a stale PROCESSING match job back to PENDING", async () => {
  const fixture = createFixture();
  fixture.seedMatchJob("user-1", {
    id: "stuck-1",
    status: "PROCESSING",
    updatedAt: new Date(Date.now() - 20 * 60_000),
  });

  // @ts-expect-error acessa método privado só em teste
  await fixture.worker.recoverStaleProcessing();

  assert.equal(fixture.matchJobs.get("stuck-1")?.status, "PENDING");
});

test("MonitorProfileMatchingWorker marks a stale PROCESSING match job FAILED once attempts are exhausted", async () => {
  const fixture = createFixture();
  fixture.seedMatchJob("user-1", {
    id: "stuck-1",
    status: "PROCESSING",
    attempts: 2,
    updatedAt: new Date(Date.now() - 20 * 60_000),
  });

  // @ts-expect-error acessa método privado só em teste
  await fixture.worker.recoverStaleProcessing();

  assert.equal(fixture.matchJobs.get("stuck-1")?.status, "FAILED");
});

test("MonitorProfileMatchingWorker: a job already recommended by MonitorMatchingWorker (new-job matching) is excluded from backfill discovery — no duplicate", async () => {
  const fixture = createFixture();
  fixture.seedProfile();
  fixture.seedJob({ id: "job-1" });
  // Simula que MonitorMatchingWorker (vaga nova x N perfis) já criou a
  // recomendação para este par antes do backfill rodar.
  fixture.seedRecommendation({
    id: "rec-from-other-worker",
    jobId: "job-1",
    score: 70,
    opportunityLevel: 3,
  });

  const matchJob = fixture.seedMatchJob("user-1");
  // @ts-expect-error acessa método privado só em teste
  await fixture.worker.processJob(matchJob);

  // A discoverNewRecommendations não cria uma segunda linha para o mesmo
  // par (userId,jobId) — a reconciliação (que roda antes) é quem mantém o
  // score da recomendação já existente atualizado, sem duplicá-la.
  assert.equal(fixture.recommendations.size, 1);
  assert.equal(
    fixture.recommendations.get("rec-from-other-worker")?.jobId,
    "job-1",
  );
  assert.equal(
    fixture.recommendations.get("rec-from-other-worker")?.supersededAt,
    null,
  );
});

test("a user without Monitor entitlement is skipped entirely — no backfill/rematch work, existing history untouched", async () => {
  const fixture = createFixture();
  fixture.seedProfile();
  fixture.seedJob({ id: "job-1" });
  fixture.seedRecommendation({ id: "rec-existing", jobId: "job-1" });
  fixture.setEntitled(false);

  const matchJob = fixture.seedMatchJob("user-1");
  // @ts-expect-error acessa método privado só em teste
  await fixture.worker.processJob(matchJob);

  // Nada novo é descoberto...
  assert.equal(fixture.recommendations.size, 1);
  // ...e a recomendação que já existia continua exatamente como estava —
  // perder entitlement nunca apaga histórico.
  const existing = fixture.recommendations.get("rec-existing");
  assert.ok(existing);
  assert.equal(existing?.supersededAt, null);
  assert.equal(existing?.dismissedAt, null);
});
