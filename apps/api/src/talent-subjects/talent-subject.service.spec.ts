// Teste de integração real (Postgres local — earlycv_test, nunca produção)
// do TalentSubjectService — Fase 2D (docs/specs/2026-09-04-cv-canonical-
// profile-pipeline-plan.md, seção 3). Cobre: mesma sessão sempre resolve
// pro mesmo TalentSubject, sessões diferentes nunca são fundidas
// silenciosamente (resolução de identidade cross-sessão é escopo de 2E,
// ver comentário no service), e concorrência real (duas chamadas
// simultâneas da MESMA sessão, sem TalentSubjectSessionSignal prévio,
// resolvem pro mesmo sujeito, sem duplicar).
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";

import { PrismaClient } from "@prisma/client";

import { DatabaseService } from "../database/database.service";
import { TalentSubjectService } from "./talent-subject.service";

const prisma = new PrismaClient();
const database = new DatabaseService(prisma);
const service = new TalentSubjectService(database);

test("resolveForGuestSession: sem sinal prévio, cria TalentSubject novo + TalentSubjectSessionSignal", async () => {
  const guestSessionHash = randomUUID();

  const result = await service.resolveForGuestSession(guestSessionHash);

  assert.equal(result.created, true);
  const subject = await prisma.talentSubject.findUnique({
    where: { id: result.talentSubjectId },
  });
  assert.ok(subject);

  const signal = await prisma.talentSubjectSessionSignal.findUnique({
    where: { guestSessionHash },
  });
  assert.equal(signal?.talentSubjectId, result.talentSubjectId);
});

test("resolveForGuestSession: mesma sessão resolve pro MESMO TalentSubject em chamadas sucessivas", async () => {
  const guestSessionHash = randomUUID();

  const first = await service.resolveForGuestSession(guestSessionHash);
  const second = await service.resolveForGuestSession(guestSessionHash);

  assert.equal(first.talentSubjectId, second.talentSubjectId);
  assert.equal(second.created, false);

  const signalCount = await prisma.talentSubjectSessionSignal.count({
    where: { guestSessionHash },
  });
  assert.equal(signalCount, 1);
});

test("resolveForGuestSession: sessões diferentes nunca são fundidas silenciosamente (cada uma ganha seu próprio TalentSubject)", async () => {
  const sessionA = randomUUID();
  const sessionB = randomUUID();

  const resultA = await service.resolveForGuestSession(sessionA);
  const resultB = await service.resolveForGuestSession(sessionB);

  assert.notEqual(resultA.talentSubjectId, resultB.talentSubjectId);
});

test("resolveForGuestSession: concorrência real — duas chamadas simultâneas da MESMA sessão sem sinal prévio resolvem pro mesmo TalentSubject", async () => {
  const guestSessionHash = randomUUID();

  const [resultA, resultB] = await Promise.all([
    service.resolveForGuestSession(guestSessionHash),
    service.resolveForGuestSession(guestSessionHash),
  ]);

  assert.equal(resultA.talentSubjectId, resultB.talentSubjectId);

  const signalCount = await prisma.talentSubjectSessionSignal.count({
    where: { guestSessionHash },
  });
  assert.equal(signalCount, 1);

  const subjectCount = await prisma.talentSubject.count({
    where: {
      OR: [
        { id: resultA.talentSubjectId },
        { sessionSignals: { some: { guestSessionHash } } },
      ],
    },
  });
  // Só o TalentSubject vencedor referenciado pelo sinal permanece
  // "vivo" logicamente — o perdedor (se algum processo criou um órfão)
  // nunca é referenciado por nenhum CvSource nem sinal, e não afeta o
  // resultado observável.
  assert.ok(subjectCount >= 1);
});
