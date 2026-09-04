// Backfill de UserRadarProfile pra usuários com CV já analisado antes da
// feature de Radar/Alerta existir (ou que só passaram pelo fluxo legado de
// cv-adaptation, que nunca chamou UserRadarProfileService.refresh()).
//
// Sem esse backfill, quando o ghost mode for desligado em produção só os
// usuários que analisarem o CV DAQUI PRA FRENTE (ou que visitarem
// /alerta-vaga-certa, disparando o self-heal de getProfile()) entram no
// Alerta — todo o histórico de análises anteriores fica de fora, mesmo
// sendo candidatos elegíveis de verdade.
//
// Critério de elegibilidade: UserProfile.profileReadinessStatus === "ready"
// (mesmo campo já usado como gate em cv-adaptation.service.ts — cobre tanto
// quem passou pela extração canônica nova quanto pelo fluxo legado de
// upload/análise). Um usuário entra no backfill se ainda não tem
// UserRadarProfile, ou se tem um com areas vazio (mesmo critério do
// self-heal em getProfile()).
//
// refresh() só lê dados que já estão em UserProfile — sem custo de IA, sem
// chamada externa — e é idempotente (upsert por userId único), então é
// seguro rodar em lote e repetir se precisar.
//
// Por padrão roda em --dry-run (só lê e reporta, nunca escreve). Passe
// --apply pra gravar de verdade, e --limit=N pra processar só os N
// primeiros (piloto barato antes da base inteira).
//
//   npm run radar:backfill-profiles --workspace @earlycv/api
//   npm run radar:backfill-profiles --workspace @earlycv/api -- --apply --limit=50

import { PrismaClient } from "@prisma/client";

import { DatabaseService } from "../database/database.service";
import { UserRadarProfileService } from "../radar/user-radar-profile.service";

const APPLY = process.argv.includes("--apply");
const DRY_RUN = !APPLY;
const LIMIT_ARG = process.argv.find((arg) => arg.startsWith("--limit="));
const LIMIT = LIMIT_ARG
  ? Number.parseInt(LIMIT_ARG.split("=")[1], 10)
  : undefined;

type Candidate = {
  userId: string;
  email: string;
  name: string;
  reason: "missing" | "empty_areas";
};

async function findCandidates(prisma: PrismaClient): Promise<Candidate[]> {
  const readyProfiles = await prisma.userProfile.findMany({
    where: { profileReadinessStatus: "ready" },
    select: {
      userId: true,
      user: { select: { email: true, name: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  const existingRadarProfiles = await prisma.userRadarProfile.findMany({
    where: { userId: { in: readyProfiles.map((p) => p.userId) } },
    select: { userId: true, areas: true },
  });
  const existingByUserId = new Map(
    existingRadarProfiles.map((r) => [r.userId, r]),
  );

  const candidates: Candidate[] = [];
  for (const p of readyProfiles) {
    const existing = existingByUserId.get(p.userId);
    if (!existing) {
      candidates.push({
        userId: p.userId,
        email: p.user.email,
        name: p.user.name,
        reason: "missing",
      });
    } else if (existing.areas.length === 0) {
      candidates.push({
        userId: p.userId,
        email: p.user.email,
        name: p.user.name,
        reason: "empty_areas",
      });
    }
  }

  return LIMIT ? candidates.slice(0, LIMIT) : candidates;
}

async function main() {
  const prisma = new PrismaClient();
  const database = new DatabaseService(prisma);
  const radarProfileService = new UserRadarProfileService(database);

  console.log(
    `[radar-backfill] modo: ${DRY_RUN ? "DRY-RUN (nada será gravado)" : "APPLY (gravando de verdade)"}${LIMIT ? ` | limite: ${LIMIT}` : ""}`,
  );

  try {
    const readyTotal = await prisma.userProfile.count({
      where: { profileReadinessStatus: "ready" },
    });
    console.log(
      `[radar-backfill] ${readyTotal} usuário(s) com profileReadinessStatus="ready" no total`,
    );

    const candidates = await findCandidates(prisma);
    const missing = candidates.filter((c) => c.reason === "missing").length;
    const emptyAreas = candidates.filter(
      (c) => c.reason === "empty_areas",
    ).length;

    console.log(
      `[radar-backfill] ${candidates.length} precisam de backfill (${missing} sem UserRadarProfile, ${emptyAreas} com areas vazio)`,
    );

    if (candidates.length === 0) {
      console.log("[radar-backfill] nada a fazer.");
      return;
    }

    if (DRY_RUN) {
      console.log(
        "[radar-backfill] amostra (até 20) do que seria processado com --apply:",
      );
      console.table(
        candidates
          .slice(0, 20)
          .map((c) => ({ userId: c.userId, email: c.email, reason: c.reason })),
      );
      return;
    }

    let created = 0;
    let repaired = 0;
    let failed = 0;
    for (const candidate of candidates) {
      try {
        const result = await radarProfileService.refresh(candidate.userId);
        if (!result) {
          // refresh() retorna null se UserProfile sumiu entre a query e
          // aqui — não deveria acontecer, mas não é fatal pro lote.
          failed += 1;
          console.warn(
            `[radar-backfill] refresh(${candidate.userId}) retornou null (UserProfile não encontrado)`,
          );
          continue;
        }
        if (candidate.reason === "missing") created += 1;
        else repaired += 1;
      } catch (error) {
        failed += 1;
        console.warn(
          `[radar-backfill] falhou pra ${candidate.userId} (${candidate.email}):`,
          error instanceof Error ? error.message : error,
        );
      }
    }

    console.log("[radar-backfill] concluído:");
    console.table({
      candidatos: candidates.length,
      criados: created,
      reparados: repaired,
      falharam: failed,
    });
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("[radar-backfill] fatal error", error);
  process.exitCode = 1;
});
