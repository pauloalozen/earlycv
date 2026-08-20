// Limpeza pontual (não parte do pipeline normal): re-canoniza
// TalentCompetency já gravadas antes do fix de sigla/tecnologia, usando a
// MESMA função real do mapper (não duplica a lógica em SQL). Idempotente —
// pode rodar de novo sem efeito colateral.
import { PrismaClient } from "@prisma/client";

import { canonicalTechLabel } from "../talent-profiles/talent-canonical-mapper";

async function main() {
  const prisma = new PrismaClient();
  let updated = 0;
  let deletedDuplicates = 0;

  try {
    const rows = await prisma.talentCompetency.findMany({
      where: { category: "TECHNICAL_SKILL" },
      orderBy: { firstObservedAt: "asc" },
    });

    for (const row of rows) {
      const canonicalLabel = canonicalTechLabel(row.valueLabel);
      const canonicalNormalized = canonicalLabel.trim().toLowerCase();
      if (
        canonicalNormalized === row.valueNormalized &&
        canonicalLabel === row.valueLabel
      ) {
        continue;
      }

      const existing = await prisma.talentCompetency.findUnique({
        where: {
          talentProfileId_category_valueNormalized: {
            talentProfileId: row.talentProfileId,
            category: row.category,
            valueNormalized: canonicalNormalized,
          },
        },
      });

      if (existing) {
        await prisma.talentCompetency.delete({ where: { id: row.id } });
        deletedDuplicates += 1;
        continue;
      }

      await prisma.talentCompetency.update({
        where: { id: row.id },
        data: {
          valueLabel: canonicalLabel,
          valueNormalized: canonicalNormalized,
        },
      });
      updated += 1;
    }

    console.log(
      `[cleanup] updated=${updated} deletedDuplicates=${deletedDuplicates}`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("[cleanup] fatal error", error);
  process.exitCode = 1;
});
