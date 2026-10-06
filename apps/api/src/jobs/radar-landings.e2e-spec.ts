// Testes REAIS de banco (Postgres local) dos agregados das landings de SEO
// do Radar. O banco de teste pode ter outras vagas, então todo recorte aqui é
// isolado pela empresa semeada (companyName) — e os totais globais do índice
// só são conferidos para essa empresa.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, test } from "node:test";

import {
  type JobArea,
  PrismaClient,
  type SeniorityLevel,
} from "@prisma/client";

import { DatabaseService } from "../database/database.service";
import { RadarLandingsService } from "./radar-landings.service";

const prisma = new PrismaClient();
const service = new RadarLandingsService(new DatabaseService(prisma));
const tag = `rl-${randomUUID().slice(0, 8)}`;
const companyName = `ACME ${tag.toUpperCase()} LTDA`;

let companyId = "";
let seq = 0;

type JobOpts = {
  status?: "active" | "inactive";
  enrichmentStatus?: "COMPLETED" | "PENDING";
  area?: JobArea;
  seniority?: SeniorityLevel;
  workModel?: string;
  city?: string | null;
  state?: string | null;
  technologies?: string[];
  requiredSkills?: string[];
  descriptionClean?: string;
};

async function addJob(opts: JobOpts) {
  seq += 1;
  const job = await prisma.job.create({
    data: {
      canonicalKey: `${tag}-ck-${seq}`,
      city: opts.city ?? null,
      companyId,
      descriptionClean: opts.descriptionClean ?? "descrição",
      descriptionRaw: "d",
      firstSeenAt: new Date(),
      lastSeenAt: new Date(),
      locationText: "Brasil",
      normalizedTitle: "vaga",
      slug: `${tag}-vaga-${seq}`,
      sourceJobUrl: `https://example.com/${tag}/${seq}`,
      state: opts.state ?? null,
      status: opts.status ?? "active",
      title: "Vaga",
      workModel: opts.workModel ?? null,
    },
  });
  await prisma.jobEnrichment.create({
    data: {
      dominantArea: opts.area ?? "DATA_AI",
      enrichmentStatus: opts.enrichmentStatus ?? "COMPLETED",
      jobId: job.id,
      requiredSkills: opts.requiredSkills ?? [],
      seniority: opts.seniority ?? "MID",
      technologies: opts.technologies ?? [],
    },
  });
}

describe("RadarLandingsService (banco real)", () => {
  before(async () => {
    const company = await prisma.company.create({
      data: { name: companyName, normalizedName: tag },
    });
    companyId = company.id;

    await addJob({
      area: "DATA_AI",
      seniority: "JUNIOR",
      workModel: "remote",
      city: "São Paulo",
      state: "SP",
      technologies: ["python", "sql"],
      requiredSkills: ["comunicação"],
    });
    // Grafia antiga da mesma cidade/UF: agrupa com a de cima.
    await addJob({
      area: "DATA_AI",
      seniority: "SENIOR",
      workModel: "hybrid",
      city: "sao paulo",
      state: "São Paulo",
      technologies: ["python"],
    });
    // Localização lixo (não é UF): nunca vira cidade. python só em
    // requiredSkills ainda conta para a tecnologia.
    await addJob({
      area: "SOFTWARE_ENGINEERING",
      seniority: "INTERN",
      workModel: "remote",
      city: "Armazem 9",
      state: "Remote; Germany",
      technologies: ["java"],
      requiredSkills: ["python"],
    });
    // Fora do público: inativa, sem enrichment, área OTHER, sem descrição.
    await addJob({ status: "inactive" });
    await addJob({ enrichmentStatus: "PENDING" });
    await addJob({ area: "OTHER" });
    await addJob({ descriptionClean: "" });
  });

  after(async () => {
    await prisma.job.deleteMany({ where: { companyId } });
    await prisma.company.delete({ where: { id: companyId } });
    await prisma.$disconnect();
  });

  test("conta só vagas públicas, igual ao filtro de integridade do Prisma", async () => {
    const summary = await service.getSummary({ companyName });
    const prismaCount = await prisma.job.count({
      where: {
        companyId,
        descriptionClean: { not: "" },
        enrichment: {
          dominantArea: { not: "OTHER" },
          enrichmentStatus: "COMPLETED",
        },
        slug: { not: null },
        status: "active",
        title: { not: "" },
      },
    });

    assert.equal(summary.total, 3);
    assert.equal(summary.total, prismaCount);
    assert.equal(summary.newLast7Days, 3);
    assert.ok(summary.latestAt);
  });

  test("agrupa cidade por grafia e UF e descarta localização que não é UF", async () => {
    const summary = await service.getSummary({ companyName });

    assert.equal(summary.cities.length, 1);
    const [city] = summary.cities;
    assert.equal(city?.city, "São Paulo");
    assert.equal(city?.count, 2);
    assert.equal(city?.slug, "sao-paulo-sp");
    assert.equal(city?.state, "SP");
    assert.deepEqual([...(city?.spellings ?? [])].sort(), [
      "São Paulo",
      "sao paulo",
    ]);
  });

  test("tecnologia conta as duas listas, mas só vira candidata pela stack", async () => {
    const summary = await service.getSummary({ companyName });
    const techs = Object.fromEntries(
      summary.technologies.map((tech) => [tech.value, tech.count]),
    );

    assert.equal(techs.python, 3);
    assert.equal(techs.sql, 1);
    assert.equal(techs.java, 1);
    assert.equal(techs["comunicação"], undefined);
  });

  test("filtros dos recortes", async () => {
    const total = async (filters: Record<string, string>) =>
      (await service.getSummary({ companyName, ...filters })).total;

    assert.equal(await total({ technology: "Python" }), 3);
    assert.equal(await total({ area: "DATA_AI" }), 2);
    assert.equal(await total({ area: "DATA_AI", workModel: "remote" }), 1);
    assert.equal(await total({ seniority: "INTERN" }), 1);
    assert.equal(await total({ seniority: "INTERN", workModel: "remote" }), 1);
    // UF por sigla casa também a grafia por extenso.
    assert.equal(await total({ city: "São Paulo", state: "SP" }), 2);
    // Valor fora do enum é ignorado (nunca 500).
    assert.equal(await total({ area: "NAO_EXISTE" }), 3);
  });

  test("índice traz a empresa com slug e as combinações contadas", async () => {
    const index = await service.getIndex();
    const company = index.companies.find((item) => item.name === companyName);

    assert.equal(company?.count, 3);
    assert.equal(company?.slug, `acme-${tag}-ltda`);
    assert.ok(index.total >= 3);
    assert.ok(
      index.areaWorkModels.some(
        (pair) =>
          pair.a === "DATA_AI" && pair.b === "remote" && pair.count >= 1,
      ),
    );
    assert.ok(
      index.seniorityWorkModels.some(
        (pair) => pair.a === "INTERN" && pair.b === "remote" && pair.count >= 1,
      ),
    );
  });
});
