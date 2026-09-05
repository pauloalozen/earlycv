// Testes reais de banco (Postgres local) do claim atômico, retry e
// recuperação de stale do CvProcessingJob (plano, seção 1).
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { test } from "node:test";

import { PrismaClient } from "@prisma/client";

import { DatabaseService } from "../database/database.service";
import {
  CvProcessingJobService,
  MAX_CV_PROCESSING_ATTEMPTS,
} from "./cv-processing-job.service";

const prisma = new PrismaClient();
const database = new DatabaseService(prisma);
const service = new CvProcessingJobService(database);

async function createUser() {
  return prisma.user.create({
    data: {
      email: `cv-processing-job+${randomUUID()}@example.com`,
      name: "CV Processing Job Test",
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

test("claimOne: duas chamadas concorrentes pro mesmo job — só uma vence", async () => {
  const user = await createUser();
  const { cvSource, cvSubmission } = await createCvSourceAndSubmission(user.id);
  const job = await service.enqueue({
    cvSourceId: cvSource.id,
    cvSubmissionId: cvSubmission.id,
  });

  const [claimA, claimB] = await Promise.all([
    service.claimOne(job.id, "worker-a"),
    service.claimOne(job.id, "worker-b"),
  ]);

  const winners = [claimA, claimB].filter((c) => c !== null);
  assert.equal(winners.length, 1);

  const persisted = await prisma.cvProcessingJob.findUniqueOrThrow({
    where: { id: job.id },
  });
  assert.equal(persisted.status, "PROCESSING");
  assert.equal(persisted.attempts, 1);
  assert.ok(
    persisted.workerId === "worker-a" || persisted.workerId === "worker-b",
  );
});

test("enqueue: reaproveita job PENDING/PROCESSING existente pro mesmo cvSourceId (dedup)", async () => {
  const user = await createUser();
  const { cvSource, cvSubmission } = await createCvSourceAndSubmission(user.id);

  const first = await service.enqueue({
    cvSourceId: cvSource.id,
    cvSubmissionId: cvSubmission.id,
  });
  const second = await service.enqueue({
    cvSourceId: cvSource.id,
    cvSubmissionId: cvSubmission.id,
  });

  assert.equal(first.id, second.id);
});

test("enqueue: duas chamadas VERDADEIRAMENTE concorrentes (sem nenhum job prévio) pro mesmo cvSourceId nunca criam dois CvProcessingJob (pendência da Fase 2A/2B, resolvida na Fase 2F via pg_advisory_xact_lock)", async () => {
  const user = await createUser();
  const { cvSource, cvSubmission } = await createCvSourceAndSubmission(user.id);

  // Duas conexões/instâncias de PrismaClient independentes, para que as
  // duas chamadas realmente disputem o mesmo lock advisory no Postgres em
  // vez de serializar por acidente através de um único pool de conexão do
  // Node — mesmo padrão de "concorrência real de banco" já usado nos
  // testes de PROMOTE_IF_FIRST/PROMOTE_EXPLICIT do plano (seção 10).
  const prismaA = new PrismaClient();
  const prismaB = new PrismaClient();
  try {
    const serviceA = new CvProcessingJobService(new DatabaseService(prismaA));
    const serviceB = new CvProcessingJobService(new DatabaseService(prismaB));

    const [jobA, jobB] = await Promise.all([
      serviceA.enqueue({
        cvSourceId: cvSource.id,
        cvSubmissionId: cvSubmission.id,
      }),
      serviceB.enqueue({
        cvSourceId: cvSource.id,
        cvSubmissionId: cvSubmission.id,
      }),
    ]);

    assert.equal(jobA.id, jobB.id);

    const allJobsForSource = await prisma.cvProcessingJob.findMany({
      where: { cvSourceId: cvSource.id },
    });
    assert.equal(allJobsForSource.length, 1);
  } finally {
    await prismaA.$disconnect();
    await prismaB.$disconnect();
  }
});

test("markFailed: reseta pra PENDING enquanto não esgotou tentativas; vai a FAILED no limite", async () => {
  const user = await createUser();
  const { cvSource, cvSubmission } = await createCvSourceAndSubmission(user.id);
  const job = await service.enqueue({
    cvSourceId: cvSource.id,
    cvSubmissionId: cvSubmission.id,
  });

  await service.claimOne(job.id, "worker-a");
  const afterFirstFailure = await service.markFailed(
    job.id,
    new Error("boom 1"),
  );
  assert.equal(afterFirstFailure.status, "PENDING");
  assert.equal(afterFirstFailure.lastError, "boom 1");

  // Esgota as tentativas restantes.
  for (
    let i = afterFirstFailure.attempts;
    i < MAX_CV_PROCESSING_ATTEMPTS;
    i += 1
  ) {
    await service.claimOne(job.id, "worker-a");
    await service.markFailed(job.id, new Error(`boom ${i + 1}`));
  }

  const final = await prisma.cvProcessingJob.findUniqueOrThrow({
    where: { id: job.id },
  });
  assert.equal(final.status, "FAILED");
  assert.ok(final.finishedAt !== null);
});

test("recoverStaleProcessing: PROCESSING travado há muito tempo volta pra PENDING (ou FAILED no limite)", async () => {
  const user = await createUser();
  const { cvSource, cvSubmission } = await createCvSourceAndSubmission(user.id);
  const job = await service.enqueue({
    cvSourceId: cvSource.id,
    cvSubmissionId: cvSubmission.id,
  });

  await service.claimOne(job.id, "dead-worker");
  // Simula claimedAt antigo (worker morreu há mais de 10 minutos).
  await prisma.cvProcessingJob.update({
    where: { id: job.id },
    data: { claimedAt: new Date(Date.now() - 20 * 60_000) },
  });

  const recoveredCount = await service.recoverStaleProcessing();
  assert.ok(recoveredCount >= 1);

  const recovered = await prisma.cvProcessingJob.findUniqueOrThrow({
    where: { id: job.id },
  });
  assert.equal(recovered.status, "PENDING");
  assert.equal(recovered.claimedAt, null);
  assert.equal(recovered.workerId, null);
  assert.match(recovered.lastError ?? "", /stale PROCESSING recuperado/);
});

test("recoverStaleProcessing: job travado que já esgotou tentativas vai a FAILED, não PENDING", async () => {
  const user = await createUser();
  const { cvSource, cvSubmission } = await createCvSourceAndSubmission(user.id);
  const job = await service.enqueue({
    cvSourceId: cvSource.id,
    cvSubmissionId: cvSubmission.id,
  });

  await prisma.cvProcessingJob.update({
    where: { id: job.id },
    data: {
      status: "PROCESSING",
      attempts: MAX_CV_PROCESSING_ATTEMPTS,
      claimedAt: new Date(Date.now() - 20 * 60_000),
      workerId: "dead-worker",
    },
  });

  await service.recoverStaleProcessing();

  const recovered = await prisma.cvProcessingJob.findUniqueOrThrow({
    where: { id: job.id },
  });
  assert.equal(recovered.status, "FAILED");
});
