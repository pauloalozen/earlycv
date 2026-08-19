// Reconstrói o histórico OBSERVADO de interação da Base de Talentos — fase 2
// (ver AGENTS.md "v3.2"). Nunca é inferência: cada linha é um fato bruto
// (a pessoa analisou a vaga X na empresa Y), lido de AnalysisJob,
// CvAdaptation e JobApplication.
//
// Idempotente: TalentInteractionHistory tem @@unique([sourceType,
// sourceRecordId]), então rodar de novo só faz upsert, nunca duplica.
//
// Requer que a fase 1 (talent:backfill-profiles -- --apply) já tenha
// rodado — perfis sem sinal de identidade resolvido ficam sem histórico
// aqui (contam como "sem profile resolvido" no relatório).
//
// Resolve os profiles com DUAS queries em memória (todo userId->profileId
// e todo snapshotId->profileId) em vez de uma query por registro — rodando
// contra produção via proxy público, uma query por registro pra milhares
// de AnalysisJob/CvAdaptation/JobApplication é lento demais (achado no
// piloto: matou o processo depois de 15min sem terminar).
//
// Por padrão roda em --dry-run. Passe --apply pra gravar de verdade.
//
//   npm run talent:reconstruct-history --workspace @earlycv/api
//   npm run talent:reconstruct-history --workspace @earlycv/api -- --apply

import { PrismaClient } from "@prisma/client";

const APPLY = process.argv.includes("--apply");
const DRY_RUN = !APPLY;

type Counters = {
  analysisJobsConsidered: number;
  analysisJobsWithoutProfile: number;
  cvAdaptationsConsidered: number;
  cvAdaptationsWithoutProfile: number;
  jobApplicationsConsidered: number;
  jobApplicationsWithoutProfile: number;
  historyRowsUpserted: number;
};

function emptyCounters(): Counters {
  return {
    analysisJobsConsidered: 0,
    analysisJobsWithoutProfile: 0,
    cvAdaptationsConsidered: 0,
    cvAdaptationsWithoutProfile: 0,
    jobApplicationsConsidered: 0,
    jobApplicationsWithoutProfile: 0,
    historyRowsUpserted: 0,
  };
}

type ProfileLookup = {
  byUserId: Map<string, string>;
  bySnapshotId: Map<string, string>;
};

async function buildProfileLookup(
  prisma: PrismaClient,
): Promise<ProfileLookup> {
  const [profiles, signals] = await Promise.all([
    prisma.talentProfile.findMany({
      where: { userId: { not: null } },
      select: { id: true, userId: true },
    }),
    prisma.talentIdentitySignal.findMany({
      where: { sourceRecordType: "AnalysisCvSnapshot" },
      select: { talentProfileId: true, sourceRecordId: true },
    }),
  ]);

  const byUserId = new Map<string, string>();
  for (const profile of profiles) {
    if (profile.userId) byUserId.set(profile.userId, profile.id);
  }

  const bySnapshotId = new Map<string, string>();
  for (const signal of signals) {
    bySnapshotId.set(signal.sourceRecordId, signal.talentProfileId);
  }

  return { byUserId, bySnapshotId };
}

function resolveProfileId(
  lookup: ProfileLookup,
  args: { userId: string | null; analysisCvSnapshotId: string | null },
): string | null {
  if (args.userId) {
    const profileId = lookup.byUserId.get(args.userId);
    if (profileId) return profileId;
  }
  if (args.analysisCvSnapshotId) {
    const profileId = lookup.bySnapshotId.get(args.analysisCvSnapshotId);
    if (profileId) return profileId;
  }
  return null;
}

async function upsertHistory(
  prisma: PrismaClient,
  data: {
    talentProfileId: string;
    sourceType: string;
    sourceRecordId: string;
    companyName: string | null;
    jobTitle: string | null;
    scoreBefore: number | null;
    scoreAfter: number | null;
    analyzedAt: Date;
  },
) {
  if (DRY_RUN) return;
  await prisma.talentInteractionHistory.upsert({
    where: {
      sourceType_sourceRecordId: {
        sourceType: data.sourceType,
        sourceRecordId: data.sourceRecordId,
      },
    },
    create: data,
    update: data,
  });
  await prisma.talentProfile.update({
    where: { id: data.talentProfileId },
    data: {
      lastInteractionAt: data.analyzedAt,
      ...(data.sourceType === "ANALYSIS_JOB"
        ? { lastAnalysisAt: data.analyzedAt }
        : {}),
    },
  });
}

async function processAnalysisJobs(
  prisma: PrismaClient,
  lookup: ProfileLookup,
  counters: Counters,
) {
  const jobs = await prisma.analysisJob.findMany({
    where: {
      status: "succeeded",
      OR: [
        { userId: { in: [...lookup.byUserId.keys()] } },
        { analysisCvSnapshotId: { in: [...lookup.bySnapshotId.keys()] } },
      ],
    },
    select: {
      id: true,
      userId: true,
      analysisCvSnapshotId: true,
      companyName: true,
      jobTitle: true,
      scoreBefore: true,
      scoreAfter: true,
      createdAt: true,
    },
  });

  for (const job of jobs) {
    counters.analysisJobsConsidered += 1;
    const talentProfileId = resolveProfileId(lookup, {
      userId: job.userId,
      analysisCvSnapshotId: job.analysisCvSnapshotId,
    });
    if (!talentProfileId) {
      counters.analysisJobsWithoutProfile += 1;
      continue;
    }

    await upsertHistory(prisma, {
      talentProfileId,
      sourceType: "ANALYSIS_JOB",
      sourceRecordId: job.id,
      companyName: job.companyName,
      jobTitle: job.jobTitle,
      scoreBefore: job.scoreBefore,
      scoreAfter: job.scoreAfter,
      analyzedAt: job.createdAt,
    });
    counters.historyRowsUpserted += 1;
  }
}

async function processCvAdaptations(
  prisma: PrismaClient,
  lookup: ProfileLookup,
  counters: Counters,
) {
  const adaptations = await prisma.cvAdaptation.findMany({
    where: { userId: { in: [...lookup.byUserId.keys()] } },
    select: {
      id: true,
      userId: true,
      companyName: true,
      jobTitle: true,
      createdAt: true,
    },
  });

  for (const adaptation of adaptations) {
    counters.cvAdaptationsConsidered += 1;
    const talentProfileId = resolveProfileId(lookup, {
      userId: adaptation.userId,
      analysisCvSnapshotId: null,
    });
    if (!talentProfileId) {
      counters.cvAdaptationsWithoutProfile += 1;
      continue;
    }

    await upsertHistory(prisma, {
      talentProfileId,
      sourceType: "CV_ADAPTATION",
      sourceRecordId: adaptation.id,
      companyName: adaptation.companyName,
      jobTitle: adaptation.jobTitle,
      scoreBefore: null,
      scoreAfter: null,
      analyzedAt: adaptation.createdAt,
    });
    counters.historyRowsUpserted += 1;
  }
}

async function processJobApplications(
  prisma: PrismaClient,
  lookup: ProfileLookup,
  counters: Counters,
) {
  const applications = await prisma.jobApplication.findMany({
    where: {
      deletedAt: null,
      userId: { in: [...lookup.byUserId.keys()] },
    },
    select: {
      id: true,
      userId: true,
      companyName: true,
      jobTitle: true,
      scoreBefore: true,
      scoreAfter: true,
      createdAt: true,
    },
  });

  for (const application of applications) {
    counters.jobApplicationsConsidered += 1;
    const talentProfileId = resolveProfileId(lookup, {
      userId: application.userId,
      analysisCvSnapshotId: null,
    });
    if (!talentProfileId) {
      counters.jobApplicationsWithoutProfile += 1;
      continue;
    }

    await upsertHistory(prisma, {
      talentProfileId,
      sourceType: "JOB_APPLICATION",
      sourceRecordId: application.id,
      companyName: application.companyName,
      jobTitle: application.jobTitle,
      scoreBefore: application.scoreBefore,
      scoreAfter: application.scoreAfter,
      analyzedAt: application.createdAt,
    });
    counters.historyRowsUpserted += 1;
  }
}

async function main() {
  const prisma = new PrismaClient();
  const counters = emptyCounters();

  console.log(
    `[talent-history] modo: ${DRY_RUN ? "DRY-RUN (nada será gravado)" : "APPLY (gravando de verdade)"}`,
  );

  try {
    const lookup = await buildProfileLookup(prisma);
    console.log(
      `[talent-history] ${lookup.byUserId.size} profiles com userId, ${lookup.bySnapshotId.size} sinais de snapshot resolvidos`,
    );

    await processAnalysisJobs(prisma, lookup, counters);
    await processCvAdaptations(prisma, lookup, counters);
    await processJobApplications(prisma, lookup, counters);

    console.log("[talent-history] concluído:");
    console.table(counters);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("[talent-history] fatal error", error);
  process.exitCode = 1;
});
