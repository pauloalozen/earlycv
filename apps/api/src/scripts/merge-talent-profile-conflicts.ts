// Merge manual de conflitos de identidade revisados por humano — fase 1/2
// da Base de Talentos (ver AGENTS.md "v3.2"). NUNCA automático: cada par
// abaixo foi revisado individualmente (mesmo nome + email/telefone/LinkedIn
// idênticos, ver revisão dos 16 conflitos em 2026-08-20) antes de entrar
// nessa lista. Regra combinada com Paulo: manter sempre o perfil
// REGISTRADO (com userId) quando um dos lados tem conta e o outro não;
// entre dois registrados, mantém o mais antigo.
//
// Move todas as linhas filhas do "loser" pro "winner" (upsert respeitando
// as @@unique — se o winner já tem a mesma chave, descarta a duplicata do
// loser em vez de sobrescrever), marca os conflitos entre o par como
// resolvidos, e apaga o profile perdedor. Idempotente: rodar de novo com
// os mesmos pares não tem efeito (loser já não existe mais).
//
// Por padrão roda em --dry-run. Passe --apply pra gravar de verdade.
//
//   npm run talent:merge-conflicts --workspace @earlycv/api
//   npm run talent:merge-conflicts --workspace @earlycv/api -- --apply

import { PrismaClient } from "@prisma/client";

const APPLY = process.argv.includes("--apply");
const DRY_RUN = !APPLY;

// [winnerId, loserId] — revisados manualmente em 2026-08-20.
const MERGE_PAIRS: Array<[string, string]> = [
  ["cmt0qj8gx00inqwgmwhec2f44", "cmt0r0rlu01bdqwgmp2p0act8"], // Bruno Leitão Donatelli
  ["cmt0ocwvm0031qwcshqo7o66w", "cmt0od33g003nqwcssr3nx3zb"], // Fernando Lemos
  ["cmt0qrpdj00v1qwgma2he0i8n", "cmt0qjddz00j3qwgmtbu4cz36"], // Matheus Victor Costa Nunes (1/2)
  ["cmt0qrpdj00v1qwgma2he0i8n", "cmt0qrc0s00uhqwgm9a3e3xoy"], // Matheus Victor Costa Nunes (2/2)
  ["cmt0oc2og0005qwcsspyq0l6b", "cmt0ocyik0035qwcsyw9nqhtl"], // Paulo Cesar Alozen
  ["cmt0oe8et007jqwcs7k7bsphn", "cmt0ooagc0055qw41vu289u7r"], // Paulo Omarini
  ["cmt0qhbox00cnqwgmryfahe05", "cmt0qyyqi016uqwgm79ipe11o"], // Silvana Souza Gonçalves
  ["cmt0uir98008lqwi6hg0kzwwa", "cmt0uj8mu00a7qwi68326ffes"], // Vítor Costa dos Santos
];

const CACHE_FIELDS = [
  "fullName",
  "primaryEmail",
  "phone",
  "linkedinUrl",
  "city",
  "state",
  "country",
  "currentTitle",
  "seniority",
] as const;

async function mergeSignals(
  prisma: PrismaClient,
  winnerId: string,
  loserId: string,
) {
  const rows = await prisma.talentIdentitySignal.findMany({
    where: { talentProfileId: loserId },
  });
  for (const row of rows) {
    const existing = await prisma.talentIdentitySignal.findUnique({
      where: {
        signalType_normalizedValue: {
          signalType: row.signalType,
          normalizedValue: row.normalizedValue,
        },
      },
    });
    if (existing) continue; // já pertence a alguém (deveria ser o winner)
    if (!DRY_RUN) {
      await prisma.talentIdentitySignal.update({
        where: { id: row.id },
        data: { talentProfileId: winnerId },
      });
    }
  }
}

async function mergeCompetencies(
  prisma: PrismaClient,
  winnerId: string,
  loserId: string,
) {
  const rows = await prisma.talentCompetency.findMany({
    where: { talentProfileId: loserId },
  });
  for (const row of rows) {
    const existing = await prisma.talentCompetency.findUnique({
      where: {
        talentProfileId_category_valueNormalized: {
          talentProfileId: winnerId,
          category: row.category,
          valueNormalized: row.valueNormalized,
        },
      },
    });
    if (existing) continue;
    if (!DRY_RUN) {
      await prisma.talentCompetency.update({
        where: { id: row.id },
        data: { talentProfileId: winnerId },
      });
    }
  }
}

async function mergeLanguages(
  prisma: PrismaClient,
  winnerId: string,
  loserId: string,
) {
  const rows = await prisma.talentLanguageSkill.findMany({
    where: { talentProfileId: loserId },
  });
  for (const row of rows) {
    const existing = await prisma.talentLanguageSkill.findUnique({
      where: {
        talentProfileId_language: {
          talentProfileId: winnerId,
          language: row.language,
        },
      },
    });
    if (existing) continue;
    if (!DRY_RUN) {
      await prisma.talentLanguageSkill.update({
        where: { id: row.id },
        data: { talentProfileId: winnerId },
      });
    }
  }
}

async function mergeCertifications(
  prisma: PrismaClient,
  winnerId: string,
  loserId: string,
) {
  const rows = await prisma.talentCertification.findMany({
    where: { talentProfileId: loserId },
  });
  for (const row of rows) {
    const existing = await prisma.talentCertification.findUnique({
      where: {
        talentProfileId_nameNormalized: {
          talentProfileId: winnerId,
          nameNormalized: row.nameNormalized,
        },
      },
    });
    if (existing) continue;
    if (!DRY_RUN) {
      await prisma.talentCertification.update({
        where: { id: row.id },
        data: { talentProfileId: winnerId },
      });
    }
  }
}

async function mergeExperiences(
  prisma: PrismaClient,
  winnerId: string,
  loserId: string,
) {
  const rows = await prisma.talentExperience.findMany({
    where: { talentProfileId: loserId },
  });
  for (const row of rows) {
    const existing = await prisma.talentExperience.findUnique({
      where: {
        talentProfileId_sourceRecordType_sourceRecordId_companyNormalized_roleNormalized:
          {
            talentProfileId: winnerId,
            sourceRecordType: row.sourceRecordType,
            sourceRecordId: row.sourceRecordId,
            companyNormalized: row.companyNormalized,
            roleNormalized: row.roleNormalized,
          },
      },
    });
    if (existing) continue;
    if (!DRY_RUN) {
      await prisma.talentExperience.update({
        where: { id: row.id },
        data: { talentProfileId: winnerId },
      });
    }
  }
}

async function mergeEducation(
  prisma: PrismaClient,
  winnerId: string,
  loserId: string,
) {
  const rows = await prisma.talentEducation.findMany({
    where: { talentProfileId: loserId },
  });
  for (const row of rows) {
    const existing = await prisma.talentEducation.findUnique({
      where: {
        talentProfileId_sourceRecordType_sourceRecordId: {
          talentProfileId: winnerId,
          sourceRecordType: row.sourceRecordType,
          sourceRecordId: row.sourceRecordId,
        },
      },
    });
    if (existing) continue;
    if (!DRY_RUN) {
      await prisma.talentEducation.update({
        where: { id: row.id },
        data: { talentProfileId: winnerId },
      });
    }
  }
}

async function mergeHistory(
  prisma: PrismaClient,
  winnerId: string,
  loserId: string,
) {
  if (!DRY_RUN) {
    await prisma.talentInteractionHistory.updateMany({
      where: { talentProfileId: loserId },
      data: { talentProfileId: winnerId },
    });
  }
}

async function mergeCacheFields(
  prisma: PrismaClient,
  winnerId: string,
  loserId: string,
) {
  const [winner, loser] = await Promise.all([
    prisma.talentProfile.findUniqueOrThrow({ where: { id: winnerId } }),
    prisma.talentProfile.findUniqueOrThrow({ where: { id: loserId } }),
  ]);

  const patch: Record<string, unknown> = {};
  for (const field of CACHE_FIELDS) {
    if (!winner[field] && loser[field]) patch[field] = loser[field];
  }
  if (winner.primaryAreas.length === 0 && loser.primaryAreas.length > 0) {
    patch.primaryAreas = loser.primaryAreas;
  }
  const winnerLast = winner.lastInteractionAt?.getTime() ?? 0;
  const loserLast = loser.lastInteractionAt?.getTime() ?? 0;
  if (loserLast > winnerLast) patch.lastInteractionAt = loser.lastInteractionAt;
  const winnerAnalysis = winner.lastAnalysisAt?.getTime() ?? 0;
  const loserAnalysis = loser.lastAnalysisAt?.getTime() ?? 0;
  if (loserAnalysis > winnerAnalysis)
    patch.lastAnalysisAt = loser.lastAnalysisAt;

  if (Object.keys(patch).length === 0) return;
  if (!DRY_RUN) {
    await prisma.talentProfile.update({ where: { id: winnerId }, data: patch });
  }
}

async function resolveConflicts(
  prisma: PrismaClient,
  winnerId: string,
  loserId: string,
) {
  if (DRY_RUN) return;
  await prisma.talentIdentityConflict.updateMany({
    where: {
      resolvedAt: null,
      OR: [
        { profileAId: winnerId, profileBId: loserId },
        { profileAId: loserId, profileBId: winnerId },
      ],
    },
    data: { resolvedAt: new Date(), resolution: "merged" },
  });
}

async function main() {
  const prisma = new PrismaClient();

  console.log(
    `[merge-conflicts] modo: ${DRY_RUN ? "DRY-RUN (nada será gravado)" : "APPLY (gravando de verdade)"} | ${MERGE_PAIRS.length} pares`,
  );

  try {
    for (const [winnerId, loserId] of MERGE_PAIRS) {
      const loser = await prisma.talentProfile.findUnique({
        where: { id: loserId },
      });
      if (!loser) {
        console.log(
          `[merge-conflicts] ${loserId} já não existe (merge anterior) — pulando`,
        );
        continue;
      }

      console.log(
        `[merge-conflicts] merging ${loserId} -> ${winnerId} (${loser.fullName})`,
      );

      await mergeSignals(prisma, winnerId, loserId);
      await mergeCompetencies(prisma, winnerId, loserId);
      await mergeLanguages(prisma, winnerId, loserId);
      await mergeCertifications(prisma, winnerId, loserId);
      await mergeExperiences(prisma, winnerId, loserId);
      await mergeEducation(prisma, winnerId, loserId);
      await mergeHistory(prisma, winnerId, loserId);
      await mergeCacheFields(prisma, winnerId, loserId);
      await resolveConflicts(prisma, winnerId, loserId);

      if (!DRY_RUN) {
        await prisma.talentProfile.delete({ where: { id: loserId } });
      }
    }

    console.log("[merge-conflicts] concluído");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("[merge-conflicts] fatal error", error);
  process.exitCode = 1;
});
