// Backfill de extração canônica MASTERCV pra usuários que já usaram o
// produto (têm CvAdaptation) mas cujo UserProfile nunca ficou "ready" —
// sem isso, o usuário nunca é candidato ao Alerta de Vaga Certa (ver
// UserRadarProfileService.refresh(), que só lê de UserProfile).
//
// Dois grupos distintos de elegibilidade (achado 2026-09-12, caso real:
// usuária com 12+ análises, CV master desde jun/2026, profile nunca saiu
// de "empty" — ver docs/specs — a causa raiz foi corrigida em
// CvAdaptationService#resolveMasterPromotionIntent, mas o histórico
// anterior à correção continua quebrado e precisa deste backfill):
//
//   GRUPO 1 — já tem master, só falta rodar a extração:
//     Resume com isMaster=true, kind=master, rawText preenchido
//     AND UserProfile.profileReadinessStatus IN ('empty','partial')
//
//   GRUPO 2 — nunca teve master nenhum (o caso mais comum: reanalisou
//   várias vezes sem nunca clicar "salvar como master"):
//     Nenhum Resume com isMaster=true
//     AND existe CvAdaptation do usuário (já é cliente ativo)
//     AND existe Resume kind='master' com rawText preenchido — NUNCA
//         kind='adapted' (são placeholders residuais do fluxo de
//         adaptação, tipo "CV para Enterprise Technical Sales Director,
//         LATAM", sem CV de verdade dentro — pegar um desses foi a causa
//         do resultado "partial" no teste de 3 usuários de 2026-09-11)
//     Escolhe o Resume kind='master' mais recente por createdAt, e
//     PROMOVE ele a master (isMaster=true, demovendo qualquer outro)
//     antes de rodar a extração — mesma semântica de
//     resolveMasterPromotionIntent (masterIntent: PROMOTE_EXPLICIT,
//     porque não é "primeiro CV", é reparo de estado quebrado).
//
// Diferente de backfill-radar-profiles.ts (que só copia dado já existente,
// sem custo), este script FAZ UMA CHAMADA DE IA REAL por usuário
// (AI_SUPPLIER_MASTERCV, ~$0,008/usuário no gpt-5.4-mini com o tamanho
// médio de CV do banco) — não é de graça, não é idempotente-sem-custo:
// rodar de novo pro mesmo usuário paga de novo (MasterCvCanonicalExtraction
// não faz dedup por hash entre execuções deste script, só evita duplicar
// a MESMA extração dentro do mesmo processJob).
//
// Modos:
//   (padrão) --dry-run: só lista candidatos dos dois grupos, zero chamada
//     de IA, zero escrita.
//   --apply --limit=N: roda de verdade pros N primeiros candidatos
//     (grupo 1 primeiro, depois grupo 2; ordem: createdAt do UserProfile).
//   --apply --user-ids=id1,id2,...: roda de verdade só pra esses userIds
//     específicos (precisam ser elegíveis em algum dos dois grupos) — uso
//     principal: teste controlado antes/depois numa amostra pequena.
//   --test-sample: ignora --limit, escolhe exatamente 3 candidatos do
//     grupo 1 — 1 de cada categoria de crédito (com crédito / pagante
//     zerado / nunca pagou) — roda a extração de verdade pros 3 E
//     sobrescreve a senha deles (só funciona se DATABASE_URL apontar pra
//     um banco local de homolog/test — ver guarda de segurança abaixo).
//
//   npm run mastercv:backfill --workspace @earlycv/api
//   npm run mastercv:backfill --workspace @earlycv/api -- --apply --limit=10
//   npm run mastercv:backfill --workspace @earlycv/api -- --apply --user-ids=abc,def
//   npm run mastercv:backfill --workspace @earlycv/api -- --test-sample

import * as argon2 from "argon2";
import { PrismaClient } from "@prisma/client";

import { DatabaseService } from "../database/database.service";
import { ProfileCanonicalMergeService } from "../profiles/profile-canonical-merge.service";
import { ProfileReadinessService } from "../profiles/profile-readiness.service";
import { UserRadarProfileService } from "../radar/user-radar-profile.service";
import { createAiClientFromEnv } from "../common/ai-client-factory";
import { MasterCvCanonicalExtractionService } from "../master-cv-canonical-extraction/master-cv-canonical-extraction.service";

const APPLY = process.argv.includes("--apply");
const TEST_SAMPLE = process.argv.includes("--test-sample");
const DRY_RUN = !APPLY && !TEST_SAMPLE;
const LIMIT_ARG = process.argv.find((arg) => arg.startsWith("--limit="));
const LIMIT = LIMIT_ARG
  ? Number.parseInt(LIMIT_ARG.split("=")[1], 10)
  : undefined;
const USER_IDS_ARG = process.argv.find((arg) =>
  arg.startsWith("--user-ids="),
);
const USER_IDS = USER_IDS_ARG
  ? new Set(USER_IDS_ARG.split("=")[1].split(",").filter(Boolean))
  : undefined;

type CreditCategory = "com_credito" | "pagante_zerado" | "nunca_pagou";
type Group = "grupo1_tem_master_sem_profile" | "grupo2_sem_master";

type Candidate = {
  userId: string;
  email: string;
  name: string;
  resumeId: string;
  rawText: string;
  category: CreditCategory;
  group: Group;
  needsPromotion: boolean; // grupo 2: precisa marcar isMaster=true antes de extrair
};

function categoryOf(user: {
  creditsRemaining: number;
  planPurchases: { id: string }[];
}): CreditCategory {
  return user.creditsRemaining > 0
    ? "com_credito"
    : user.planPurchases.length > 0
      ? "pagante_zerado"
      : "nunca_pagou";
}

async function findGroup1Candidates(prisma: PrismaClient): Promise<Candidate[]> {
  const rows = await prisma.userProfile.findMany({
    where: {
      profileReadinessStatus: { in: ["empty", "partial"] },
      user: {
        resumes: { some: { isMaster: true, kind: "master", rawText: { not: null } } },
      },
    },
    select: {
      userId: true,
      user: {
        select: {
          id: true,
          email: true,
          name: true,
          creditsRemaining: true,
          resumes: {
            where: { isMaster: true, kind: "master", rawText: { not: null } },
            take: 1,
            select: { id: true, rawText: true },
          },
          planPurchases: { where: { status: "completed" }, select: { id: true }, take: 1 },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  const candidates: Candidate[] = [];
  for (const row of rows) {
    const resume = row.user.resumes[0];
    if (!resume?.rawText) continue;
    candidates.push({
      userId: row.user.id,
      email: row.user.email,
      name: row.user.name,
      resumeId: resume.id,
      rawText: resume.rawText,
      category: categoryOf(row.user),
      group: "grupo1_tem_master_sem_profile",
      needsPromotion: false,
    });
  }
  return candidates;
}

async function findGroup2Candidates(prisma: PrismaClient): Promise<Candidate[]> {
  const rows = await prisma.user.findMany({
    where: {
      AND: [
        { resumes: { none: { isMaster: true } } },
        { cvAdaptations: { some: {} } },
        { resumes: { some: { kind: "master", rawText: { not: null } } } },
      ],
    },
    select: {
      id: true,
      email: true,
      name: true,
      creditsRemaining: true,
      planPurchases: { where: { status: "completed" }, select: { id: true }, take: 1 },
      resumes: {
        where: { kind: "master", rawText: { not: null } },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { id: true, rawText: true },
      },
      profile: { select: { profileReadinessStatus: true } },
    },
  });

  const candidates: Candidate[] = [];
  for (const row of rows) {
    if (row.profile?.profileReadinessStatus === "ready") continue; // edge case raro, já ok
    const resume = row.resumes[0];
    if (!resume?.rawText) continue;
    candidates.push({
      userId: row.id,
      email: row.email,
      name: row.name,
      resumeId: resume.id,
      rawText: resume.rawText,
      category: categoryOf(row),
      group: "grupo2_sem_master",
      needsPromotion: true,
    });
  }
  return candidates;
}

async function findCandidates(prisma: PrismaClient): Promise<Candidate[]> {
  const [group1, group2] = await Promise.all([
    findGroup1Candidates(prisma),
    findGroup2Candidates(prisma),
  ]);
  return [...group1, ...group2];
}

function pickTestSample(candidates: Candidate[]): Candidate[] {
  const group1 = candidates.filter((c) => c.group === "grupo1_tem_master_sem_profile");
  const byCategory: Record<CreditCategory, Candidate | undefined> = {
    com_credito: group1.find((c) => c.category === "com_credito"),
    pagante_zerado: group1.find((c) => c.category === "pagante_zerado"),
    nunca_pagou: group1.find((c) => c.category === "nunca_pagou"),
  };
  return Object.values(byCategory).filter((c): c is Candidate => Boolean(c));
}

function assertLocalDatabase() {
  const url = process.env.DATABASE_URL ?? "";
  if (!url.includes("homolog") && !url.includes("test")) {
    throw new Error(
      `--test-sample recusado: DATABASE_URL não parece ser um banco local de homolog/test (${url.replace(/:[^:@]*@/, ":***@")}). ` +
        "Esse modo sobrescreve senha de usuário real — nunca rodar fora de um banco local.",
    );
  }
}

async function promoteToMaster(
  prisma: PrismaClient,
  userId: string,
  resumeId: string,
) {
  await prisma.$transaction([
    prisma.resume.updateMany({
      where: { userId, isMaster: true },
      data: { isMaster: false },
    }),
    prisma.resume.update({
      where: { id: resumeId },
      data: { isMaster: true },
    }),
  ]);
}

async function main() {
  const prisma = new PrismaClient();
  const database = new DatabaseService(prisma);
  const radarProfileService = new UserRadarProfileService(database);
  const extractionService = new MasterCvCanonicalExtractionService(
    database,
    new ProfileCanonicalMergeService(),
    new ProfileReadinessService(),
    createAiClientFromEnv("MASTERCV"),
    undefined,
    radarProfileService,
  );

  console.log(
    `[mastercv-backfill] modo: ${DRY_RUN ? "DRY-RUN (nada será gravado, sem chamada de IA)" : TEST_SAMPLE ? "TEST-SAMPLE (3 usuários do grupo 1, IA real, reseta senha)" : "APPLY (IA real, gravando de verdade)"}${LIMIT && !TEST_SAMPLE ? ` | limite: ${LIMIT}` : ""}${USER_IDS ? ` | user-ids: ${[...USER_IDS].join(",")}` : ""}`,
  );

  if (TEST_SAMPLE) {
    assertLocalDatabase();
  }

  try {
    const allCandidates = await findCandidates(prisma);
    console.log(
      `[mastercv-backfill] ${allCandidates.length} candidato(s) elegível(is) no total`,
    );

    const byGroup = {
      grupo1_tem_master_sem_profile: allCandidates.filter(
        (c) => c.group === "grupo1_tem_master_sem_profile",
      ).length,
      grupo2_sem_master: allCandidates.filter(
        (c) => c.group === "grupo2_sem_master",
      ).length,
    };
    console.table(byGroup);

    if (allCandidates.length === 0) {
      console.log("[mastercv-backfill] nada a fazer.");
      return;
    }

    if (DRY_RUN) {
      console.log("[mastercv-backfill] amostra (até 20) do que seria processado:");
      console.table(
        allCandidates
          .slice(0, 20)
          .map((c) => ({
            userId: c.userId,
            email: c.email,
            grupo: c.group,
            categoria: c.category,
          })),
      );
      return;
    }

    const toProcess = TEST_SAMPLE
      ? pickTestSample(allCandidates)
      : USER_IDS
        ? allCandidates.filter((c) => USER_IDS.has(c.userId))
        : LIMIT
          ? allCandidates.slice(0, LIMIT)
          : allCandidates;

    if (TEST_SAMPLE && toProcess.length < 3) {
      console.warn(
        `[mastercv-backfill] só achou ${toProcess.length}/3 categorias com candidato disponível — seguindo mesmo assim.`,
      );
    }
    if (USER_IDS && toProcess.length < USER_IDS.size) {
      const found = new Set(toProcess.map((c) => c.userId));
      const missing = [...USER_IDS].filter((id) => !found.has(id));
      console.warn(
        `[mastercv-backfill] ${missing.length} user-id(s) não elegível(is)/não encontrado(s), ignorando: ${missing.join(",")}`,
      );
    }

    console.log(
      `[mastercv-backfill] processando ${toProcess.length} usuário(s) — chamada de IA real por usuário`,
    );

    const results: {
      email: string;
      grupo: string;
      categoria: string;
      status: string;
      readinessAfter: string;
    }[] = [];

    let processedCount = 0;
    for (const candidate of toProcess) {
      processedCount += 1;
      const progressPrefix = `[mastercv-backfill] ${processedCount} de ${toProcess.length}`;
      console.log(
        `${progressPrefix} — processando ${candidate.email} (${candidate.group})...`,
      );
      try {
        if (candidate.needsPromotion) {
          await promoteToMaster(prisma, candidate.userId, candidate.resumeId);
        }

        // upsert em vez de create: inputHash é uma string fixa (não é hash
        // de conteúdo real, só marca "veio do backfill"), então um retry
        // pro MESMO resumeId (ex.: extração anterior falhou por payload
        // malformado da IA) bate na constraint única (resumeId, inputHash)
        // e nunca chegava a tentar de novo — achado 2026-09-12, lote de
        // produção. Reseta pending/attempts/lastError a cada tentativa.
        const extraction = await database.masterCvCanonicalExtraction.upsert({
          where: {
            resumeId_inputHash: {
              resumeId: candidate.resumeId,
              inputHash: "backfill-script",
            },
          },
          create: {
            userId: candidate.userId,
            resumeId: candidate.resumeId,
            inputHash: "backfill-script",
            status: "pending",
          },
          update: {
            status: "pending",
            attempts: 0,
            lastError: null,
          },
        });

        await extractionService.processJob({
          extractionId: extraction.id,
          rawText: candidate.rawText,
        });

        const profile = await database.userProfile.findUnique({
          where: { userId: candidate.userId },
          select: { profileReadinessStatus: true },
        });

        const readinessAfter = profile?.profileReadinessStatus ?? "unknown";
        console.log(`${progressPrefix} — ok, readiness: ${readinessAfter}`);
        results.push({
          email: candidate.email,
          grupo: candidate.group,
          categoria: candidate.category,
          status: "ok",
          readinessAfter,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.log(`${progressPrefix} — FALHOU: ${message}`);
        results.push({
          email: candidate.email,
          grupo: candidate.group,
          categoria: candidate.category,
          status: `falhou: ${message}`,
          readinessAfter: "-",
        });
      }
    }

    console.log("[mastercv-backfill] resultado:");
    console.table(results);

    if (TEST_SAMPLE) {
      console.log(
        "[mastercv-backfill] resetando senha dos 3 usuários de teste (só banco local)...",
      );
      const testPassword = `teste-mastercv-${Date.now().toString(36)}`;
      const passwordHash = await argon2.hash(testPassword);

      for (const candidate of toProcess) {
        await database.user.update({
          where: { id: candidate.userId },
          data: { passwordHash },
        });
      }

      console.log("[mastercv-backfill] credenciais de teste (só neste banco local):");
      console.table(
        toProcess.map((c) => ({
          email: c.email,
          senha: testPassword,
          categoria: c.category,
        })),
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("[mastercv-backfill] fatal error", error);
  process.exitCode = 1;
});
