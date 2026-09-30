// Testes REAIS de banco (Postgres local) das listagens do admin paginadas no
// servidor: nenhuma consulta pode carregar a base inteira nem blobs como
// previewJson. Semeia dados próprios com prefixo único e limpa no final.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";

import { PrismaClient } from "@prisma/client";

import { AdminPendingService } from "./admin-pending/admin-pending.service";
import { AdminUsersService } from "./admin-users/admin-users.service";
import { CompaniesService } from "./companies/companies.service";
import { DatabaseService } from "./database/database.service";
import { DashboardAdminService } from "./ingestion/dashboard-admin.service";
import { JobSourcesService } from "./job-sources/job-sources.service";
import { PaymentRecoveryEligibilityService } from "./payment-recovery/payment-recovery-eligibility.service";
import { PaymentsService } from "./payments/payments.service";

const prisma = new PrismaClient();
const database = new DatabaseService(prisma);
const companiesService = new CompaniesService(database);
const jobSourcesService = new JobSourcesService(database, companiesService);
const pendingService = new AdminPendingService(database);
const usersService = new AdminUsersService(database);
const dashboardService = new DashboardAdminService(database);
const paymentsService = new (
  PaymentsService as unknown as new (
    ...args: unknown[]
  ) => PaymentsService
)(database, {});

const tag = `adminperf-${randomUUID().slice(0, 8)}`;
const HUGE_PREVIEW = { items: "x".repeat(200_000) };

type Ids = {
  companies: Record<string, string>;
  sources: Record<string, string>;
  users: string[];
};
const ids: Ids = { companies: {}, sources: {}, users: [] };

async function makeCompany(key: string) {
  const company = await prisma.company.create({
    data: { name: `${tag} ${key}`, normalizedName: `${tag}-${key}` },
  });
  ids.companies[key] = company.id;
  return company;
}

async function makeSource(
  key: string,
  companyKey: string,
  opts: {
    lastErrorMessage?: string;
    run?: "completed" | "failed";
    activeJobs?: number;
  } = {},
) {
  const source = await prisma.jobSource.create({
    data: {
      checkIntervalMinutes: 30,
      companyId: ids.companies[companyKey] as string,
      crawlStrategy: "html",
      lastErrorMessage: opts.lastErrorMessage ?? null,
      parserKey: "custom_html",
      sourceName: `${tag} ${key}`,
      sourceType: "custom_html",
      sourceUrl: `https://example.com/${tag}/${key}`,
    },
  });
  ids.sources[key] = source.id;

  if (opts.run) {
    await prisma.ingestionRun.create({
      data: {
        jobSourceId: source.id,
        previewJson: HUGE_PREVIEW,
        startedAt: new Date(),
        status: opts.run,
      },
    });
  }

  for (let i = 0; i < (opts.activeJobs ?? 0); i += 1) {
    await prisma.job.create({
      data: {
        canonicalKey: `${tag}-${key}-${i}`,
        companyId: ids.companies[companyKey] as string,
        descriptionClean: "d",
        descriptionRaw: "d",
        firstSeenAt: new Date(),
        jobSourceId: source.id,
        lastSeenAt: new Date(),
        locationText: "SP",
        normalizedTitle: "t",
        sourceJobUrl: `https://example.com/${tag}/${key}/${i}`,
        status: "active",
        title: "t",
      },
    });
  }

  return source;
}

before(async () => {
  // Empresas: uma por status de empresa
  await makeCompany("semfonte"); // incompleta
  await makeCompany("aguardando"); // fonte sem run e sem erro
  await makeCompany("falha"); // última run failed
  await makeCompany("erro"); // fonte com lastErrorMessage
  await makeCompany("completa"); // run completed, sem erro

  await makeSource("s-aguardando", "aguardando");
  await makeSource("s-falha", "falha", { run: "failed", activeJobs: 3 });
  await makeSource("s-erro", "erro", {
    lastErrorMessage: "boom",
    run: "completed",
    activeJobs: 1,
  });
  await makeSource("s-completa", "completa", {
    run: "completed",
    activeJobs: 2,
  });
  await makeSource("s-completa2", "completa", {
    run: "completed",
    activeJobs: 0,
  });
});

after(async () => {
  await prisma.job.deleteMany({ where: { canonicalKey: { startsWith: tag } } });
  await prisma.ingestionRun.deleteMany({
    where: { jobSource: { sourceName: { startsWith: tag } } },
  });
  await prisma.jobSource.deleteMany({
    where: { sourceName: { startsWith: tag } },
  });
  await prisma.company.deleteMany({ where: { name: { startsWith: tag } } });
  await prisma.resume.deleteMany({
    where: { userId: { in: ids.users } },
  });
  await prisma.userProfile.deleteMany({ where: { userId: { in: ids.users } } });
  await prisma.user.deleteMany({ where: { id: { in: ids.users } } });
  await prisma.$disconnect();
});

describe("JobSourcesService — paginação no servidor e sem blobs", () => {
  it("listPaginated não devolve previewJson da última run", async () => {
    const page = await jobSourcesService.listPaginated({
      pageSize: 100,
      search: tag,
    });

    assert.equal(page.total, 5);
    const withRuns = page.rows.filter((row) => row.ingestionRuns.length > 0);
    assert.ok(withRuns.length >= 3, "esperava fontes com run");
    for (const row of withRuns) {
      assert.equal(
        "previewJson" in (row.ingestionRuns[0] as object),
        false,
        "previewJson não pode vir na listagem",
      );
    }
    assert.ok(
      JSON.stringify(page).length < 20_000,
      "resposta não pode carregar os blobs (200 KB cada)",
    );
  });

  it("ordena por activeJobsCount no servidor, com página e total corretos", async () => {
    const desc = await jobSourcesService.listPaginated({
      page: 1,
      pageSize: 2,
      search: tag,
      sortBy: "activeJobsCount",
      sortDir: "desc",
    });
    assert.deepEqual(
      desc.rows.map((r) => [
        r.sourceName.replace(`${tag} `, ""),
        r.activeJobsCount,
      ]),
      [
        ["s-falha", 3],
        ["s-completa", 2],
      ],
    );
    assert.equal(desc.total, 5);
    assert.equal(desc.totalPages, 3);

    const page3 = await jobSourcesService.listPaginated({
      page: 3,
      pageSize: 2,
      search: tag,
      sortBy: "activeJobsCount",
      sortDir: "desc",
    });
    assert.equal(page3.rows.length, 1);

    const asc = await jobSourcesService.listPaginated({
      page: 1,
      pageSize: 5,
      search: tag,
      sortBy: "activeJobsCount",
      sortDir: "asc",
    });
    const counts = asc.rows.map((r) => r.activeJobsCount);
    assert.deepEqual(
      counts,
      [...counts].sort((a, b) => a - b),
    );
  });

  it("filtra por companyId", async () => {
    const page = await jobSourcesService.listPaginated({
      companyId: ids.companies.completa,
      pageSize: 100,
    });
    assert.equal(page.total, 2);
  });

  it("listOptions é leve, limitada e aceita busca/companyId", async () => {
    const all = await jobSourcesService.listOptions({ limit: 3, search: tag });
    assert.equal(all.options.length, 3);
    assert.equal(all.total, 5);
    assert.equal(all.limit, 3);
    const first = all.options[0] as Record<string, unknown>;
    assert.deepEqual(Object.keys(first).sort(), [
      "company",
      "companyId",
      "id",
      "sourceName",
      "sourceType",
    ]);

    const byCompany = await jobSourcesService.listOptions({
      companyId: ids.companies.completa,
    });
    assert.equal(byCompany.total, 2);

    const capped = await jobSourcesService.listOptions({ limit: 100_000 });
    assert.ok(capped.limit <= 500);
  });

  it("getById não devolve previewJson nas runs", async () => {
    const source = await jobSourcesService.getById(
      ids.sources["s-falha"] as string,
    );
    assert.equal("previewJson" in (source.ingestionRuns[0] as object), false);
  });
});

describe("CompaniesService.listPaginated — status exato no banco", () => {
  const status = async (key: string) => {
    const page = await companiesService.listPaginated({
      pageSize: 100,
      search: `${tag} ${key}`,
    });
    return page.rows[0]?.status.label;
  };

  it("classifica cada empresa como o front classificava", async () => {
    assert.equal(await status("semfonte"), "incompleta");
    assert.equal(await status("aguardando"), "aguardando primeiro run");
    assert.equal(await status("falha"), "com falha recente");
    assert.equal(await status("erro"), "com falha recente");
    assert.equal(await status("completa"), "completa");
  });

  it("devolve contagem de fontes e tom do status", async () => {
    const page = await companiesService.listPaginated({
      search: `${tag} completa`,
    });
    assert.equal(page.rows[0]?.sourcesCount, 2);
    assert.equal(page.rows[0]?.status.tone, "success");
    const falha = await companiesService.listPaginated({
      search: `${tag} falha`,
    });
    assert.equal(falha.rows[0]?.status.tone, "danger");
  });

  it("filtro de status pagina no servidor e o total bate", async () => {
    const page = await companiesService.listPaginated({
      pageSize: 1,
      search: tag,
      status: "com falha recente",
    });
    assert.equal(page.total, 2);
    assert.equal(page.rows.length, 1);
    assert.equal(page.totalPages, 2);

    const page2 = await companiesService.listPaginated({
      page: 2,
      pageSize: 1,
      search: tag,
      status: "com falha recente",
    });
    assert.equal(page2.rows.length, 1);
    assert.notEqual(page.rows[0]?.id, page2.rows[0]?.id);
  });

  it("sem filtro, pageSize limita as linhas e total conta tudo", async () => {
    const page = await companiesService.listPaginated({
      pageSize: 2,
      search: tag,
    });
    assert.equal(page.rows.length, 2);
    assert.equal(page.total, 5);
  });
});

describe("AdminPendingService — janela paginada sobre os tipos", () => {
  it("conta e lista pendências de empresa/fonte com a mesma regra do front", async () => {
    const all = await pendingService.list({ pageSize: 100, query: tag });

    assert.equal(all.counts["company-missing-source"], 1);
    assert.equal(all.counts["source-missing-first-run"], 1);
    // s-falha (última run failed) e s-erro (lastErrorMessage)
    assert.equal(all.counts["source-failed-recent-run"], 2);
    const types = all.items.map((i) => i.type);
    assert.deepEqual(types.slice(0, 1), ["company-missing-source"]);
    assert.ok(types.includes("source-failed-recent-run"));
    const erro = all.items.find(
      (i) =>
        i.type === "source-failed-recent-run" && i.title.endsWith("s-erro"),
    );
    assert.equal(erro?.description, "boom");
  });

  it("a janela atravessa tipos: página de tamanho 2 e total consistentes", async () => {
    const p1 = await pendingService.list({ page: 1, pageSize: 2, query: tag });
    const p2 = await pendingService.list({ page: 2, pageSize: 2, query: tag });
    const p3 = await pendingService.list({ page: 3, pageSize: 2, query: tag });

    assert.equal(p1.total, 4);
    assert.equal(p1.totalPages, 2);
    assert.equal(p1.items.length, 2);
    assert.equal(p2.items.length, 2);
    assert.equal(p3.items.length, 0);
    const keys = [...p1.items, ...p2.items].map(
      (i) => `${i.type}:${i.entityId}`,
    );
    assert.equal(new Set(keys).size, 4, "sem itens repetidos entre páginas");
  });

  it("filtra por tipo", async () => {
    const only = await pendingService.list({
      pageSize: 50,
      query: tag,
      type: "source-missing-first-run",
    });
    assert.equal(only.total, 1);
    assert.equal(only.items[0]?.cta, "Rodar agora");
  });
});

describe("AdminUsersService — sempre paginado + filtro de perfil", () => {
  before(async () => {
    const mk = async (
      n: number,
      profile: null | { headline: string; city: string; country: string },
      master: boolean,
    ) => {
      const user = await prisma.user.create({
        data: { email: `${tag}-${n}@example.com`, name: `${tag} user ${n}` },
      });
      ids.users.push(user.id);
      if (profile) {
        await prisma.userProfile.create({
          data: { userId: user.id, ...profile },
        });
      }
      if (master) {
        await prisma.resume.create({
          data: {
            isMaster: true,
            kind: "master",
            title: "cv",
            userId: user.id,
          },
        });
      }
      return user;
    };
    await mk(1, null, false); // perfil ausente
    await mk(2, { city: "", country: "", headline: "dev" }, false); // incompleto
    await mk(3, { city: "SP", country: "BR", headline: "dev" }, false); // sem cv master
    await mk(4, { city: "SP", country: "BR", headline: "dev" }, true); // completo
  });

  it("sem page/limit devolve no máximo 50 (nunca a base inteira)", async () => {
    const result = await usersService.list({ query: tag });
    assert.equal(result.total, 4);
    assert.ok(result.users.length <= 50);
    assert.equal(result.limit, 50);
  });

  it("limita o tamanho da página a 100", async () => {
    const result = await usersService.list({ limit: 100_000 });
    assert.equal(result.limit, 100);
    assert.ok(result.users.length <= 100);
  });

  it("filtra por profileStatus como o front (perfil ausente/incompleto/completo)", async () => {
    const run = async (profileStatus: string) =>
      (await usersService.list({ profileStatus, query: tag })).users.map((u) =>
        u.name.replace(`${tag} user `, ""),
      );

    assert.deepEqual(await run("perfil ausente"), ["1"]);
    assert.deepEqual(await run("perfil incompleto"), ["2"]);
    // "completo" do perfil ignora o CV master (users 3 e 4)
    assert.deepEqual((await run("completo")).sort(), ["3", "4"]);
  });

  it("pendências de usuário batem com os status de completude", async () => {
    const all = await pendingService.list({ pageSize: 100, query: tag });
    assert.equal(all.counts["user-missing-profile"], 1);
    assert.equal(all.counts["user-incomplete-profile"], 1);
    assert.equal(all.counts["user-missing-master-resume"], 1);
  });
});

describe("Visão geral e pagamentos — só agregados / paginação real", () => {
  it("getOverviewStats devolve contagens (sem listas)", async () => {
    const stats = await dashboardService.getOverviewStats(
      new Date(Date.now() - 60_000),
    );
    assert.deepEqual(Object.keys(stats).sort(), [
      "newUsers",
      "totalAdaptedResumes",
      "totalUsers",
    ]);
    assert.ok(stats.totalUsers >= 4);
    assert.ok(stats.newUsers >= 4);
    assert.equal(typeof stats.totalAdaptedResumes, "number");
  });

  it("listPayments pagina no banco (total real, página com take)", async () => {
    const user = await prisma.user.create({
      data: { email: `${tag}-pay@example.com`, name: `${tag} pay` },
    });
    ids.users.push(user.id);
    for (let i = 0; i < 5; i += 1) {
      await prisma.planPurchase.create({
        data: {
          amountInCents: 1000 * (i + 1),
          creditsGranted: 1,
          paymentProvider: "mercadopago",
          paymentReference: `${tag}-ref-${i}`,
          planType: "starter",
          status: i < 3 ? "completed" : "pending",
          userId: user.id,
        },
      });
    }

    const page = await paymentsService.listPayments({
      limit: 2,
      page: 2,
      userId: user.id,
    });
    assert.equal(page.total, 5);
    assert.equal(page.items.length, 2);

    const summary = await paymentsService.getPaymentsSummary({
      from: new Date(Date.now() - 60_000).toISOString(),
    });
    assert.ok(summary.approvedCount >= 3);
    assert.ok(summary.revenueInCents >= 6000);

    await prisma.planPurchase.deleteMany({ where: { userId: user.id } });
  });

  it("recuperação de pagamento só considera usuários com compra pendente e devolve score da página", async () => {
    const service = new PaymentRecoveryEligibilityService(database);
    const pendingUser = await prisma.user.create({
      data: { email: `${tag}-rec-a@example.com`, name: `${tag} rec-a` },
    });
    const paidUser = await prisma.user.create({
      data: { email: `${tag}-rec-b@example.com`, name: `${tag} rec-b` },
    });
    ids.users.push(pendingUser.id, paidUser.id);
    await prisma.planPurchase.createMany({
      data: [
        {
          amountInCents: 1000,
          creditsGranted: 1,
          paymentProvider: "mercadopago",
          paymentReference: `${tag}-rec-pending`,
          planType: "starter",
          status: "pending",
          userId: pendingUser.id,
        },
        {
          amountInCents: 1000,
          creditsGranted: 1,
          paymentProvider: "mercadopago",
          paymentReference: `${tag}-rec-paid`,
          planType: "starter",
          status: "completed",
          userId: paidUser.id,
        },
      ],
    });

    const result = await service.listPending({
      eligibilityStatus: "all",
      search: tag,
    });

    assert.equal(result.total, 1);
    assert.equal(result.items[0]?.userId, pendingUser.id);
    assert.equal(result.items[0]?.eligibilityStatus, "eligible");

    await prisma.planPurchase.deleteMany({
      where: { userId: { in: [pendingUser.id, paidUser.id] } },
    });
  });
});
