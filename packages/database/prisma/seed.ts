import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const company = await prisma.company.upsert({
    where: { normalizedName: "earlycv-demo" },
    update: {
      country: "BR",
      name: "EarlyCV Demo",
    },
    create: {
      country: "BR",
      name: "EarlyCV Demo",
      normalizedName: "earlycv-demo",
    },
  });

  await prisma.jobSource.upsert({
    where: {
      companyId_sourceUrl: {
        companyId: company.id,
        sourceUrl: "https://careers.earlycv.dev",
      },
    },
    update: {
      checkIntervalMinutes: 30,
      crawlStrategy: "html",
      parserKey: "custom_html",
      sourceName: "Career Site",
      sourceType: "custom_html",
    },
    create: {
      checkIntervalMinutes: 30,
      companyId: company.id,
      crawlStrategy: "html",
      parserKey: "custom_html",
      sourceName: "Career Site",
      sourceType: "custom_html",
      sourceUrl: "https://careers.earlycv.dev",
    },
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
