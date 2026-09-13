// Reparo pós-backfill: UserRadarProfileService.refresh() é chamado
// fire-and-forget depois de cada extração canônica bem-sucedida (tanto no
// pipeline legado quanto no novo) — se essa chamada falhar (ex.: blip de
// conexão com o Postgres remoto, "Response from the Engine was empty",
// achado 2026-09-12 no lote de produção do backfill de MASTERCV), o
// UserProfile fica certo mas o UserRadarProfile (o que o Monitor de fato lê
// pra casar vaga) fica parado no snapshot anterior — sem custo de IA, sem
// reprocessar a extração, só refaz o refresh() (leitura pura de
// UserProfile já populado).
//
// Critério: UserProfile.profileReadinessStatus IN ('ready','partial') AND
// (UserRadarProfile não existe OU foi gerado ANTES da última atualização
// do UserProfile).
//
// Modos:
//   (padrão) --dry-run: só lista quem seria reparado.
//   --apply: roda o refresh() de verdade pros candidatos.
//
//   npm run radar:repair --workspace @earlycv/api
//   npm run radar:repair --workspace @earlycv/api -- --apply

import { PrismaClient } from "@prisma/client";

import { DatabaseService } from "../database/database.service";
import { UserRadarProfileService } from "../radar/user-radar-profile.service";

const APPLY = process.argv.includes("--apply");

async function main() {
  const prisma = new PrismaClient();
  const database = new DatabaseService(prisma);
  const radarProfileService = new UserRadarProfileService(database);

  try {
    const profiles = await prisma.userProfile.findMany({
      where: { profileReadinessStatus: { in: ["ready", "partial"] } },
      select: { userId: true, updatedAt: true },
    });

    const candidates: { userId: string; email: string }[] = [];
    for (const profile of profiles) {
      const radar = await prisma.userRadarProfile.findUnique({
        where: { userId: profile.userId },
        select: { generatedAt: true },
      });
      if (!radar || radar.generatedAt < profile.updatedAt) {
        const user = await prisma.user.findUnique({
          where: { id: profile.userId },
          select: { email: true },
        });
        candidates.push({ userId: profile.userId, email: user?.email ?? "?" });
      }
    }

    console.log(
      `[radar-repair] ${candidates.length} usuário(s) com UserRadarProfile ausente/desatualizado (de ${profiles.length} com profile ready/partial)`,
    );
    console.table(candidates);

    if (!APPLY) {
      console.log("[radar-repair] dry-run — nada foi gravado.");
      return;
    }

    for (let i = 0; i < candidates.length; i++) {
      const c = candidates[i];
      const prefix = `[radar-repair] ${i + 1} de ${candidates.length}`;
      try {
        await radarProfileService.refresh(c.userId);
        console.log(`${prefix} — ok (${c.email})`);
      } catch (error) {
        console.log(
          `${prefix} — FALHOU (${c.email}): ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("[radar-repair] fatal error", error);
  process.exitCode = 1;
});
