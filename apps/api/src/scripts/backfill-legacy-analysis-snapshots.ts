import { createHash, randomUUID } from "node:crypto";

import { PrismaClient, type Prisma } from "@prisma/client";

import { StorageService } from "../storage/storage.service";

// Análises criadas antes de 2026-04-29 podem não ter analysisCvSnapshot (o
// snapshot só passou a ser obrigatório a partir dessa data). Sem snapshot,
// essas análises dependem do Resume master ainda existir — e o CV master é
// um singleton substituível/apagável a qualquer momento (ver
// resumes.service.ts). Este script fecha essa lacuna: gera o snapshot
// retroativamente, a partir do masterResume ainda vivo, para toda análise
// legada que ainda tem como. Depois de rodar, essas análises ficam tão
// independentes do CV master quanto qualquer análise recente.
//
// Idempotente: só processa CvAdaptation com analysisCvSnapshotId nulo, então
// pode ser rodado de novo com segurança.

function normalizeSnapshotText(input: string): string {
  return input
    .replace(/^﻿/, "")
    .replace(/\r\n?/g, "\n")
    .trim();
}

function buildSnapshotProfessionalProfile(text: string) {
  const normalizedText = normalizeSnapshotText(text);
  const lines = normalizedText
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const highlights = lines.filter((line) => line.length >= 8).slice(0, 24);

  const profile = {
    version: "fallback_v1",
    textPreview: normalizedText.slice(0, 4_000),
    textLength: normalizedText.length,
    highlights,
  } satisfies Prisma.InputJsonObject;

  return {
    fingerprint: createHash("sha256").update(normalizedText).digest("hex"),
    profile,
  };
}

async function main() {
  const prisma = new PrismaClient();
  const storage = new StorageService();

  let backfilled = 0;
  let skippedNoText = 0;
  let failed = 0;

  try {
    const candidates = await prisma.cvAdaptation.findMany({
      where: { analysisCvSnapshotId: null, masterResumeId: { not: null } },
      select: {
        id: true,
        userId: true,
        masterResume: { select: { rawText: true } },
      },
    });

    console.log(
      `[backfill-snapshots] found ${candidates.length} legacy adaptation(s) without a snapshot`,
    );

    for (const adaptation of candidates) {
      const rawText = adaptation.masterResume?.rawText?.trim();
      if (!rawText) {
        skippedNoText += 1;
        console.warn(
          `[backfill-snapshots] skipping ${adaptation.id} — master resume has no rawText to snapshot`,
        );
        continue;
      }

      try {
        const normalizedText = normalizeSnapshotText(rawText);
        const professionalProfile =
          buildSnapshotProfessionalProfile(normalizedText);
        const textBuffer = Buffer.from(normalizedText, "utf8");
        const textSha256 = createHash("sha256")
          .update(textBuffer)
          .digest("hex");
        const textStorageKey = `analysis-cv-snapshots/text/${randomUUID()}.md`;
        await storage.putObject(textStorageKey, textBuffer, "text/markdown");

        const snapshot = await prisma.analysisCvSnapshot.create({
          data: {
            userId: adaptation.userId,
            guestSessionHash: null,
            sourceType: "master_resume",
            textStorageKey,
            textSha256,
            textSizeBytes: textBuffer.byteLength,
            professionalProfileFingerprint: professionalProfile.fingerprint,
            professionalProfileJson: professionalProfile.profile,
            expiresAt: null,
          },
        });

        await prisma.cvAdaptation.update({
          where: { id: adaptation.id },
          data: { analysisCvSnapshotId: snapshot.id },
        });

        backfilled += 1;
      } catch (error) {
        failed += 1;
        console.error(
          `[backfill-snapshots] failed for ${adaptation.id}:`,
          error instanceof Error ? error.message : String(error),
        );
      }
    }

    console.log(
      `[backfill-snapshots] done — backfilled=${backfilled} skipped(no rawText)=${skippedNoText} failed=${failed}`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("[backfill-snapshots] fatal error", error);
  process.exitCode = 1;
});
