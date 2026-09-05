// Teste de integração real (Postgres local) do CvProcessingEntrypointService
// — Fase 2B: substituição do base64 inline por StorageService real. Cobre
// upload de texto novo, deduplicação por hash (mesmo texto não duplica
// objeto no storage nem CvSource) e preservação de metadados de submissão.
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { test } from "node:test";

import { PrismaClient } from "@prisma/client";

import { DatabaseService } from "../database/database.service";
import { CvProcessingEntrypointService } from "./cv-processing-entrypoint.service";
import { CvProcessingJobService } from "./cv-processing-job.service";

const prisma = new PrismaClient();
const database = new DatabaseService(prisma);
const jobService = new CvProcessingJobService(database);

class FakeStorage {
  readonly puts: Array<{ key: string; body: Buffer }> = [];
  private readonly objects = new Map<string, Buffer>();

  async putObject(key: string, body: Buffer): Promise<string> {
    this.puts.push({ key, body });
    this.objects.set(key, body);
    return `fake://${key}`;
  }

  async getObject(key: string): Promise<Buffer> {
    const object = this.objects.get(key);
    if (!object)
      throw Object.assign(new Error("NoSuchKey"), { name: "NoSuchKey" });
    return object;
  }
}

async function createUser() {
  return prisma.user.create({
    data: {
      email: `cv-processing-entrypoint+${randomUUID()}@example.com`,
      name: "CV Processing Entrypoint Test",
      profile: { create: {} },
    },
  });
}

test("entrypoint (Fase 2B): upload de texto grava só a chave no storage, nunca o conteúdo inline", async () => {
  const user = await createUser();
  const storage = new FakeStorage();
  const entrypoint = new CvProcessingEntrypointService(
    database,
    jobService,
    storage,
  );

  const text = "Fulano de Tal\nExperiência relevante.";
  const { cvSource } = await entrypoint.enqueueFromUserText({
    userId: user.id,
    text,
    masterIntent: "NONE",
    submission: { origin: "PASTED_TEXT" },
  });

  assert.equal(storage.puts.length, 1);
  assert.equal(cvSource.textStorageKey, storage.puts[0].key);
  // Nunca guarda o conteúdo inline — textStorageKey é só a chave.
  assert.ok(!cvSource.textStorageKey.includes("Fulano"));
  assert.equal(
    cvSource.textSha256,
    createHash("sha256").update(text).digest("hex"),
  );

  const storedText = (
    await storage.getObject(cvSource.textStorageKey)
  ).toString("utf-8");
  assert.equal(storedText, text);
});

test("entrypoint (Fase 2B): mesmo hash não duplica objeto no storage nem CvSource (dedup real)", async () => {
  const user = await createUser();
  const storage = new FakeStorage();
  const entrypoint = new CvProcessingEntrypointService(
    database,
    jobService,
    storage,
  );

  const text = "Conteúdo idêntico para deduplicação.";
  const first = await entrypoint.enqueueFromUserText({
    userId: user.id,
    text,
    masterIntent: "NONE",
    submission: { origin: "PASTED_TEXT" },
  });
  const second = await entrypoint.enqueueFromUserText({
    userId: user.id,
    text,
    masterIntent: "NONE",
    submission: { origin: "PASTED_TEXT" },
  });

  assert.equal(first.cvSource.id, second.cvSource.id);
  // Só um putObject — a segunda chamada encontrou o CvSource existente e
  // não regravou o objeto (a chave já é determinística pelo hash).
  assert.equal(storage.puts.length, 1);

  const sourcesCount = await prisma.cvSource.count({
    where: { userId: user.id, textSha256: first.cvSource.textSha256 },
  });
  assert.equal(sourcesCount, 1);

  // Duas CvSubmission distintas (dois envios reais), mesmo CvSource —
  // plano, seção 6.
  const submissionsCount = await prisma.cvSubmission.count({
    where: { cvSourceId: first.cvSource.id },
  });
  assert.equal(submissionsCount, 2);
});

test("entrypoint (Fase 2B): metadados de arquivo preservados na CvSubmission (FILE_UPLOAD)", async () => {
  const user = await createUser();
  const storage = new FakeStorage();
  const entrypoint = new CvProcessingEntrypointService(
    database,
    jobService,
    storage,
  );

  const { cvSubmission } = await entrypoint.enqueueFromUserText({
    userId: user.id,
    text: "Texto extraído do PDF.",
    masterIntent: "NONE",
    submission: {
      origin: "FILE_UPLOAD",
      fileName: "curriculo.pdf",
      mimeType: "application/pdf",
      fileSizeBytes: 12345,
    },
  });

  assert.equal(cvSubmission.origin, "FILE_UPLOAD");
  assert.equal(cvSubmission.fileName, "curriculo.pdf");
  assert.equal(cvSubmission.mimeType, "application/pdf");
  assert.equal(cvSubmission.fileSizeBytes, 12345);
});
