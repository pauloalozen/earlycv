// Testes reais de banco (Postgres local — earlycv_test, nunca produção)
// para a trigger de defesa criada na Fase 2F
// (docs/specs/2026-09-04-cv-canonical-profile-pipeline-plan.md, pendência
// da seção "Corrigir o comentário incorreto"/seção 3 do relatório da
// Fase 2F): um AnalysisJob só pode ir a "succeeded" com um
// CvStructuredProfile READY por trás — mas SOMENTE quando
// cvProcessingJobId está preenchido (linha do pipeline novo). Linha legada
// (cvProcessingJobId nulo) nunca é afetada, provado no primeiro teste.
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { test } from "node:test";

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function createUser() {
  return prisma.user.create({
    data: {
      email: `analysis-job-trigger+${randomUUID()}@example.com`,
      name: "AnalysisJob Trigger Test",
    },
  });
}

async function createCvSourceAndSubmission(userId: string) {
  const textSha256 = createHash("sha256").update(randomUUID()).digest("hex");
  const cvSource = await prisma.cvSource.create({
    data: {
      ownerType: "USER",
      userId,
      textStorageKey: `inline:${Buffer.from("cv text").toString("base64")}`,
      textSha256,
    },
  });
  const cvSubmission = await prisma.cvSubmission.create({
    data: { cvSourceId: cvSource.id, origin: "PASTED_TEXT" },
  });
  return { cvSource, cvSubmission };
}

async function createCvProcessingJob(
  cvSourceId: string,
  cvSubmissionId: string,
) {
  return prisma.cvProcessingJob.create({
    data: { cvSourceId, cvSubmissionId, status: "PENDING" },
  });
}

async function createStructuredProfile(
  cvSourceId: string,
  status: "PENDING" | "READY" | "FAILED",
) {
  return prisma.cvStructuredProfile.create({
    data: {
      cvSourceId,
      extractorVersion: `v-${randomUUID()}`,
      schemaVersion: "v1",
      status,
      ...(status === "READY"
        ? {
            canonicalJson: {},
            coverageJson: {},
            confidenceJson: {},
            evidenceJson: {},
          }
        : {}),
    },
  });
}

test("AnalysisJob legado (cvProcessingJobId nulo) vai a succeeded livremente, sem CvStructuredProfile nenhum — trigger nunca se aplica", async () => {
  const user = await createUser();
  const job = await prisma.analysisJob.create({
    data: {
      ownerKind: "authenticated",
      userId: user.id,
      jobDescriptionText: "Vaga legada",
      status: "pending",
    },
  });

  const updated = await prisma.analysisJob.update({
    where: { id: job.id },
    data: { status: "succeeded" },
  });

  assert.equal(updated.status, "succeeded");
  assert.equal(updated.cvStructuredProfileId, null);
});

test("AnalysisJob do pipeline novo (cvProcessingJobId preenchido) rejeita succeeded sem cvStructuredProfileId", async () => {
  const user = await createUser();
  const { cvSource, cvSubmission } = await createCvSourceAndSubmission(user.id);
  const cvProcessingJob = await createCvProcessingJob(
    cvSource.id,
    cvSubmission.id,
  );

  const job = await prisma.analysisJob.create({
    data: {
      ownerKind: "authenticated",
      userId: user.id,
      jobDescriptionText: "Vaga pipeline novo",
      status: "pending",
      cvProcessingJobId: cvProcessingJob.id,
    },
  });

  await assert.rejects(
    () =>
      prisma.analysisJob.update({
        where: { id: job.id },
        data: { status: "succeeded" },
      }),
    /exige cvStructuredProfileId preenchido/,
  );
});

test("AnalysisJob do pipeline novo rejeita succeeded quando o CvStructuredProfile referenciado não está READY", async () => {
  const user = await createUser();
  const { cvSource, cvSubmission } = await createCvSourceAndSubmission(user.id);
  const cvProcessingJob = await createCvProcessingJob(
    cvSource.id,
    cvSubmission.id,
  );
  const notReadyProfile = await createStructuredProfile(cvSource.id, "PENDING");

  const job = await prisma.analysisJob.create({
    data: {
      ownerKind: "authenticated",
      userId: user.id,
      jobDescriptionText: "Vaga pipeline novo",
      status: "pending",
      cvProcessingJobId: cvProcessingJob.id,
    },
  });

  await assert.rejects(
    () =>
      prisma.analysisJob.update({
        where: { id: job.id },
        data: {
          status: "succeeded",
          cvStructuredProfileId: notReadyProfile.id,
        },
      }),
    /exige CvStructuredProfile READY/,
  );
});

test("AnalysisJob do pipeline novo aceita succeeded quando o CvStructuredProfile referenciado está READY (mesmo padrão de cv-analysis.worker.ts#processReadyJob)", async () => {
  const user = await createUser();
  const { cvSource, cvSubmission } = await createCvSourceAndSubmission(user.id);
  const cvProcessingJob = await createCvProcessingJob(
    cvSource.id,
    cvSubmission.id,
  );
  const readyProfile = await createStructuredProfile(cvSource.id, "READY");

  const job = await prisma.analysisJob.create({
    data: {
      ownerKind: "authenticated",
      userId: user.id,
      jobDescriptionText: "Vaga pipeline novo",
      status: "pending",
      cvProcessingJobId: cvProcessingJob.id,
    },
  });

  const updated = await prisma.analysisJob.update({
    where: { id: job.id },
    data: { status: "succeeded", cvStructuredProfileId: readyProfile.id },
  });

  assert.equal(updated.status, "succeeded");
  assert.equal(updated.cvStructuredProfileId, readyProfile.id);
});
