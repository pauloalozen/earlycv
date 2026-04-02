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

  const affiliatePartner = await prisma.affiliatePartner.upsert({
    where: { slug: "criador-demo" },
    update: {
      email: "parcerias@earlycv.dev",
      name: "Criador Demo",
      status: "active",
    },
    create: {
      email: "parcerias@earlycv.dev",
      name: "Criador Demo",
      slug: "criador-demo",
      status: "active",
    },
  });

  const affiliateCampaign = await prisma.affiliateCampaign.upsert({
    where: {
      id: `${affiliatePartner.id}-campanha-inicial`,
    },
    update: {
      attributionWindowDays: 30,
      defaultCommissionType: "percentage",
      defaultCommissionValue: 20,
      name: "Campanha inicial",
      partnerId: affiliatePartner.id,
      status: "active",
    },
    create: {
      id: `${affiliatePartner.id}-campanha-inicial`,
      attributionWindowDays: 30,
      defaultCommissionType: "percentage",
      defaultCommissionValue: 20,
      name: "Campanha inicial",
      partnerId: affiliatePartner.id,
      status: "active",
    },
  });

  await prisma.affiliateCode.upsert({
    where: { code: "CRIADORDEMO30" },
    update: {
      campaignId: affiliateCampaign.id,
      landingPageUrl: "https://earlycv.app/parcerias/criador-demo",
      status: "active",
    },
    create: {
      campaignId: affiliateCampaign.id,
      code: "CRIADORDEMO30",
      landingPageUrl: "https://earlycv.app/parcerias/criador-demo",
      status: "active",
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
