// Métricas finais da Base de Talentos — fase 2 (ver AGENTS.md "v3.2").
// Responde os critérios de sucesso da sprint com dados reais. Só leitura,
// sem flags — sempre seguro de rodar.
//
//   npm run talent:metrics --workspace @earlycv/api

import { PrismaClient } from "@prisma/client";

async function main() {
  const prisma = new PrismaClient();

  try {
    const [
      totalProfiles,
      registeredProfiles,
      guestOnlyProfiles,
      totalUsers,
      totalResumes,
      totalSnapshots,
      totalAnalysisJobs,
      totalCvAdaptations,
      confidenceGroups,
      profilesWithContact,
      profilesWithCompetency,
      profilesWithExperience,
      profilesWithHistory,
      openConflicts,
    ] = await Promise.all([
      prisma.talentProfile.count(),
      prisma.talentProfile.count({ where: { userId: { not: null } } }),
      prisma.talentProfile.count({ where: { userId: null } }),
      prisma.user.count({ where: { isStaff: false } }),
      prisma.resume.count(),
      prisma.analysisCvSnapshot.count(),
      prisma.analysisJob.count({ where: { status: "succeeded" } }),
      prisma.cvAdaptation.count(),
      prisma.talentProfile.groupBy({
        by: ["identityConfidence"],
        _count: true,
      }),
      prisma.talentProfile.count({
        where: {
          OR: [{ primaryEmail: { not: null } }, { phone: { not: null } }],
        },
      }),
      prisma.talentProfile.count({
        where: { competencies: { some: {} } },
      }),
      prisma.talentProfile.count({
        where: { experiences: { some: {} } },
      }),
      prisma.talentProfile.count({
        where: { interactions: { some: {} } },
      }),
      prisma.talentIdentityConflict.count({ where: { resolvedAt: null } }),
    ]);

    const matchingEligible = await prisma.talentProfile.count({
      where: {
        internalMatchingEnabled: true,
        seniority: { not: null },
        primaryAreas: { isEmpty: false },
        competencies: { some: {} },
      },
    });

    const pct = (part: number, total: number) =>
      total === 0 ? "0%" : `${((part / total) * 100).toFixed(1)}%`;

    console.log("=== Base de Talentos — métricas ===\n");

    console.log("1-3. Pessoas distintas / cadastradas / não-cadastradas");
    console.table({
      "pessoas distintas (TalentProfile)": totalProfiles,
      "usuários cadastrados (User, não-staff)": totalUsers,
      "profiles ligados a um usuário": registeredProfiles,
      "profiles guest-only (sem conta)": guestOnlyProfiles,
    });

    console.log("\n4-5. CVs e análises históricas");
    console.table({
      "Resume (CVs cadastrados)": totalResumes,
      "AnalysisCvSnapshot (CVs de análise)": totalSnapshots,
      "AnalysisJob concluídos": totalAnalysisJobs,
      "CvAdaptation (Kit de Candidatura)": totalCvAdaptations,
    });

    console.log("\n6-7. Perfis recuperados e qualidade da identidade");
    console.table(
      Object.fromEntries(
        confidenceGroups.map((g) => [g.identityConfidence, g._count]),
      ),
    );

    console.log("\n8-11. Completude e elegibilidade para matching");
    console.table({
      "com dado de contato (email ou telefone)": `${profilesWithContact} (${pct(profilesWithContact, totalProfiles)})`,
      "com competências estruturadas": `${profilesWithCompetency} (${pct(profilesWithCompetency, totalProfiles)})`,
      "com experiência estruturada": `${profilesWithExperience} (${pct(profilesWithExperience, totalProfiles)})`,
      "com histórico de vagas analisadas": `${profilesWithHistory} (${pct(profilesWithHistory, totalProfiles)})`,
      "elegíveis para matching (senioridade+área+competência)": `${matchingEligible} (${pct(matchingEligible, totalProfiles)})`,
    });

    console.log("\n12. Conflitos de identidade pendentes de revisão");
    console.table({ "TalentIdentityConflict não resolvidos": openConflicts });
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("[talent-metrics] fatal error", error);
  process.exitCode = 1;
});
