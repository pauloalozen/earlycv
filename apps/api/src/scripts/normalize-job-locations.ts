// PR 2b (item 7): aplica nas vagas já gravadas a mesma normalização de
// localização da ingestão (withNormalizedLocation): cidade/UF com a grafia
// do IBGE, cidade preenchida a partir do texto livre ("Brazil - Sao
// Paulo", "BR-CWB-009") e workModel=remote para localização só de remoto.
// Vaga classificada como estrangeira não é tocada (o saneamento dela é do
// cleanup:foreign-jobs).
//
// Fila da Indexing API: só vaga pública ativa que passou de "sem
// JobPosting" para "com JobPosting" ganha URL_UPDATED (prioridade de
// backfill). A comparação é com a regra ANTERIOR ao PR 2b (sem cidade nem
// UF, vaga não remota não tinha jobLocation), então entram também as vagas
// que ganharam JobPosting só pela regra nova (país BR sem cidade), mesmo
// sem mudança de localização: o backfill não pega de novo quem já foi
// notificado antes, quando a página ainda não tinha JobPosting. Toda vaga
// alterada ou enfileirada ganha contentUpdatedAt (o lastmod do sitemap
// avisa o Google sem depender da cota).
//
// Por padrão roda em --dry-run (só lê e reporta, inclusive quantas
// pendências vai criar). Passe --apply pra gravar. Idempotente: vaga que já
// tem URL_UPDATED pendente, ou enviado com sucesso desde a mudança de
// regra, não entra de novo.
//
//   npm run jobs:normalize-locations --workspace @earlycv/api
//   npm run jobs:normalize-locations --workspace @earlycv/api -- --apply

import {
  isTalentPool,
  type JobPostingEligibilityInput,
  resolveAddressCountry,
  shouldEmitJobPosting,
} from "@earlycv/config/job-posting";
import { PrismaClient } from "@prisma/client";

import type { DatabaseService } from "../database/database.service";
import { GoogleIndexingService } from "../google-indexing/google-indexing.service";
import {
  GoogleIndexingQueueService,
  INDEXING_PRIORITY,
} from "../google-indexing/google-indexing-queue.service";
import { withNormalizedLocation } from "../ingestion/location-normalization";
import { classifyJobLocation } from "../jobs/geo-normalizer";
import { PUBLIC_JOB_INTEGRITY_WHERE } from "../jobs/public-job-integrity";

const APPLY = process.argv.includes("--apply");
const LOG = "[normalize-job-locations]";
// Dia em que a regra do JobPosting mudou (PR 2b). URL_UPDATED com sucesso a
// partir daqui já reflete a página com JobPosting.
const JOB_POSTING_RULE_CHANGED_AT = new Date("2026-10-10T00:00:00Z");

// Regra do JobPosting antes do PR 2b: jobLocation só com cidade ou UF;
// remota só com applicantLocationRequirements.
function hadJobPostingBeforePr2b(job: JobPostingEligibilityInput): boolean {
  if (isTalentPool(job.employmentType)) return false;
  if (resolveAddressCountry(job) !== "BR") return false;
  return !!job.city || !!job.state || job.workModel === "remote";
}

async function main() {
  const prisma = new PrismaClient();
  console.log(
    `${LOG} modo: ${APPLY ? "APPLY (gravando de verdade)" : "DRY-RUN (nada será gravado)"}`,
  );

  try {
    const jobs = await prisma.job.findMany({
      select: {
        city: true,
        country: true,
        employmentType: true,
        id: true,
        jobSource: { select: { isGlobalBoard: true } },
        locationText: true,
        slug: true,
        state: true,
        status: true,
        workModel: true,
      },
      orderBy: { id: "asc" },
    });
    const publicActive = new Set(
      (
        await prisma.job.findMany({
          select: { id: true },
          where: { ...PUBLIC_JOB_INTEGRITY_WHERE, status: "active" },
        })
      ).map((job) => job.id),
    );

    const counts = {
      cityChanged: 0,
      cityFilled: 0,
      foreignSkipped: 0,
      stateChanged: 0,
      stateFilled: 0,
      workModelRemote: 0,
    };
    type Change = {
      city: string | null;
      id: string;
      state: string | null;
      workModel: string | null;
    };
    const changes = new Map<string, Change>();
    const gainedCandidates = new Map<string, Change & { slug: string }>();
    let changedActive = 0;
    const samples: string[] = [];

    for (const job of jobs) {
      const input = {
        city: job.city ?? undefined,
        country: job.country ?? undefined,
        locationText: job.locationText,
        state: job.state ?? undefined,
        workModel: job.workModel ?? undefined,
      };
      if (
        classifyJobLocation({
          ...input,
          isGlobalBoard: job.jobSource?.isGlobalBoard ?? false,
        }) === "foreign"
      ) {
        counts.foreignSkipped += 1;
        continue;
      }

      const next = withNormalizedLocation({
        canonicalKey: "",
        descriptionClean: "",
        descriptionRaw: "",
        firstSeenAt: "",
        lastSeenAt: "",
        normalizedTitle: "",
        sourceJobUrl: "",
        title: "",
        ...input,
      });
      const change: Change = {
        city: next.city ?? null,
        id: job.id,
        state: next.state ?? null,
        workModel: next.workModel ?? null,
      };

      if (
        job.slug &&
        publicActive.has(job.id) &&
        !hadJobPostingBeforePr2b(job) &&
        shouldEmitJobPosting({ ...job, ...change })
      ) {
        gainedCandidates.set(job.slug, { ...change, slug: job.slug });
      }

      if (
        change.city === job.city &&
        change.state === job.state &&
        change.workModel === job.workModel
      ) {
        continue;
      }

      if (change.city !== job.city) {
        if (job.city) counts.cityChanged += 1;
        else counts.cityFilled += 1;
      }
      if (change.state !== job.state) {
        if (job.state) counts.stateChanged += 1;
        else counts.stateFilled += 1;
      }
      if (change.workModel !== job.workModel) counts.workModelRemote += 1;
      changes.set(job.id, change);
      if (job.status === "active") changedActive += 1;
      if (samples.length < 40) {
        samples.push(
          `${job.status} "${job.locationText}" city=${job.city ?? "-"} state=${job.state ?? "-"} workModel=${job.workModel ?? "-"} -> city=${change.city ?? "-"} state=${change.state ?? "-"} workModel=${change.workModel ?? "-"}`,
        );
      }
    }

    // Uma vez só: fora quem já tem URL_UPDATED pendente ou enviado com
    // sucesso desde a mudança de regra.
    const candidateSlugs = [...gainedCandidates.keys()];
    const alreadyHandled = new Set([
      ...(
        await prisma.googleIndexingQueueItem.findMany({
          select: { slug: true },
          where: {
            slug: { in: candidateSlugs },
            status: "pending",
            type: "URL_UPDATED",
          },
        })
      ).map((item) => item.slug),
      ...(
        await prisma.googleIndexingLog.findMany({
          select: { slug: true },
          where: {
            createdAt: { gte: JOB_POSTING_RULE_CHANGED_AT },
            slug: { in: candidateSlugs },
            status: "SUCCESS",
            type: "URL_UPDATED",
          },
        })
      ).map((log) => log.slug),
    ]);
    const gained = [...gainedCandidates.values()].filter(
      (candidate) => !alreadyHandled.has(candidate.slug),
    );
    const gainedOnlyByRule = gained.filter(
      (candidate) => !changes.has(candidate.id),
    ).length;

    let updated = 0;
    let enqueued = 0;
    if (APPLY) {
      const now = new Date();
      for (const change of changes.values()) {
        await prisma.job.update({
          where: { id: change.id },
          data: {
            city: change.city,
            contentUpdatedAt: now,
            state: change.state,
            workModel: change.workModel,
          },
        });
        updated += 1;
      }
      const ruleOnlyIds = gained
        .filter((candidate) => !changes.has(candidate.id))
        .map((candidate) => candidate.id);
      if (ruleOnlyIds.length > 0) {
        const result = await prisma.job.updateMany({
          data: { contentUpdatedAt: now },
          where: { id: { in: ruleOnlyIds } },
        });
        updated += result.count;
      }

      const database = prisma as unknown as DatabaseService;
      enqueued = await new GoogleIndexingQueueService(
        database,
        new GoogleIndexingService(database),
      ).enqueue(
        gained.map((candidate) => ({
          priority: INDEXING_PRIORITY.backfill,
          slug: candidate.slug,
          type: "URL_UPDATED" as const,
        })),
      );
    }

    for (const sample of samples) console.log(`${LOG} ${sample}`);
    console.log(
      `${LOG} concluído: ${jobs.length} vagas verificadas, ${changes.size} a normalizar (ativas: ${changedActive}); cidade preenchida=${counts.cityFilled}, cidade corrigida=${counts.cityChanged}, UF preenchida=${counts.stateFilled}, UF corrigida=${counts.stateChanged}, workModel->remote=${counts.workModelRemote}, estrangeiras ignoradas=${counts.foreignSkipped}; ${gained.length} pendências URL_UPDATED na Indexing API (ativas públicas que passam a ter JobPosting em relação à regra anterior; ${gainedOnlyByRule} só pela regra nova, sem mudança de localização)${APPLY ? `; ${updated} gravadas, ${enqueued} enfileiradas` : " (nenhuma gravada: rode com --apply)"}.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(`${LOG} fatal error`, error);
  process.exitCode = 1;
});
