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

async function resolveProfileId(
  prisma: PrismaClient,
  args: { userId: string | null; analysisCvSnapshotId: string | null },
): Promise<string | null> {
  if (args.userId) {
    const profile = await prisma.talentProfile.findUnique({
      where: { userId: args.userId },
      select: { id: true },
    });
    if (profile) return profile.id;
  }

  if (args.analysisCvSnapshotId) {
    const signal = await prisma.talentIdentitySignal.findFirst({
      where: {
        sourceRecordType: "AnalysisCvSnapshot",
        sourceRecordId: args.analysisCvSnapshotId,
      },
      select: { talentProfileId: true },
    });
    if (signal) return signal.talentProfileId;
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

async function processAnalysisJobs(prisma: PrismaClient, counters: Counters) {
  const jobs = await prisma.analysisJob.findMany({
    where: { status: "succeeded" },
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
    const talentProfileId = await resolveProfileId(prisma, {
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

async function processCvAdaptations(prisma: PrismaClient, counters: Counters) {
  const adaptations = await prisma.cvAdaptation.findMany({
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
    const talentProfileId = await resolveProfileId(prisma, {
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
  counters: Counters,
) {
  const applications = await prisma.jobApplication.findMany({
    where: { deletedAt: null },
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
    const talentProfileId = await resolveProfileId(prisma, {
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
    await processAnalysisJobs(prisma, counters);
    await processCvAdaptations(prisma, counters);
    await processJobApplications(prisma, counters);

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
