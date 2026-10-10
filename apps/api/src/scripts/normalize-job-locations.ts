// PR 2b (item 7): aplica nas vagas já gravadas a mesma normalização de
// localização da ingestão (withNormalizedLocation): cidade/UF com a grafia
// do IBGE, cidade preenchida a partir do texto livre ("Brazil - Sao
// Paulo", "BR-CWB-009") e workModel=remote para localização só de remoto.
// Vaga classificada como estrangeira não é tocada (o saneamento dela é do
// cleanup:foreign-jobs).
//
// Por padrão roda em --dry-run (só lê e reporta). Passe --apply pra gravar.
// Idempotente: rodar de novo não muda nada.
//
//   npm run jobs:normalize-locations --workspace @earlycv/api
//   npm run jobs:normalize-locations --workspace @earlycv/api -- --apply

import { PrismaClient } from "@prisma/client";

import { withNormalizedLocation } from "../ingestion/location-normalization";
import { classifyJobLocation } from "../jobs/geo-normalizer";

const APPLY = process.argv.includes("--apply");
const LOG = "[normalize-job-locations]";

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
        id: true,
        jobSource: { select: { isGlobalBoard: true } },
        locationText: true,
        state: true,
        status: true,
        workModel: true,
      },
      orderBy: { id: "asc" },
    });

    const counts = {
      cityChanged: 0,
      cityFilled: 0,
      foreignSkipped: 0,
      stateChanged: 0,
      stateFilled: 0,
      workModelRemote: 0,
    };
    let changedJobs = 0;
    let changedActive = 0;
    let updated = 0;
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
      const city = next.city ?? null;
      const state = next.state ?? null;
      const workModel = next.workModel ?? null;
      if (
        city === job.city &&
        state === job.state &&
        workModel === job.workModel
      ) {
        continue;
      }

      if (city !== job.city) {
        if (job.city) counts.cityChanged += 1;
        else counts.cityFilled += 1;
      }
      if (state !== job.state) {
        if (job.state) counts.stateChanged += 1;
        else counts.stateFilled += 1;
      }
      if (workModel !== job.workModel) counts.workModelRemote += 1;
      changedJobs += 1;
      if (job.status === "active") changedActive += 1;
      if (samples.length < 40) {
        samples.push(
          `${job.status} "${job.locationText}" city=${job.city ?? "-"} state=${job.state ?? "-"} workModel=${job.workModel ?? "-"} -> city=${city ?? "-"} state=${state ?? "-"} workModel=${workModel ?? "-"}`,
        );
      }

      if (APPLY) {
        await prisma.job.update({
          where: { id: job.id },
          data: { city, state, workModel },
        });
        updated += 1;
      }
    }

    for (const sample of samples) console.log(`${LOG} ${sample}`);
    console.log(
      `${LOG} concluído: ${jobs.length} vagas verificadas, ${changedJobs} a normalizar (ativas: ${changedActive}); cidade preenchida=${counts.cityFilled}, cidade corrigida=${counts.cityChanged}, UF preenchida=${counts.stateFilled}, UF corrigida=${counts.stateChanged}, workModel->remote=${counts.workModelRemote}, estrangeiras ignoradas=${counts.foreignSkipped}${APPLY ? `, ${updated} gravadas` : " (nenhuma gravada: rode com --apply)"}.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(`${LOG} fatal error`, error);
  process.exitCode = 1;
});
