import assert from "node:assert/strict";
import { test } from "node:test";

import type { DatabaseService } from "../database/database.service";
import { ForeignJobsCleanupService } from "./foreign-jobs-cleanup.service";

type FakeJob = {
  id: string;
  title: string;
  country: string | null;
  state: string | null;
  status: string;
  company: { name: string };
  jobSource: { sourceUrl: string } | null;
};

function createFixture(jobs: FakeJob[]) {
  const updateManyCalls: Array<{ ids: string[] }> = [];

  const database = {
    job: {
      findMany: async () => jobs,
      updateMany: async ({ where }: { where: { id: { in: string[] } } }) => {
        updateManyCalls.push({ ids: where.id.in });
        return { count: where.id.in.length };
      },
    },
  };

  return {
    service: new ForeignJobsCleanupService(
      database as unknown as DatabaseService,
    ),
    updateManyCalls,
  };
}

// Achado auditando fontes reais (Anthropic entrou via saneamento de
// fontes; IN-HAUS INDUSTRIAL board Teamtailor misto BR+Panamá) — o
// serviço reaproveita isForeignLocation() já usado na ingestão pra
// limpar retroativamente o que já foi publicado.
test("preview separa vaga estrangeira confirmada de vaga BR real preservada", () => {
  const { service } = createFixture([
    {
      id: "job-br",
      title: "Engenheiro de Software",
      country: "Brasil",
      state: "SP",
      status: "active",
      company: { name: "Empresa BR" },
      jobSource: { sourceUrl: "https://boards.greenhouse.io/empresabr" },
    },
    {
      id: "job-foreign",
      title: "Anthropic Fellows Program",
      country: "CAN; Remote-Friendly",
      state: null,
      status: "active",
      company: { name: "Anthropic" },
      jobSource: { sourceUrl: "https://job-boards.greenhouse.io/anthropic" },
    },
  ]);

  return service.preview().then((preview) => {
    assert.equal(preview.checked, 2);
    assert.deepEqual(
      preview.foreign.map((f) => f.jobId),
      ["job-foreign"],
    );
    assert.equal(preview.ambiguous.length, 0);
  });
});

test("preview marca como ambiguo (nao remove) sigla de UF brasileira isolada no campo country, mesmo com isForeignLocation rejeitando", () => {
  // Bug real achado em XP Inc./Inter: o parser de origem grava a UF
  // ("SP", "MG") no campo country por engano — isForeignLocation() rejeita
  // esse valor de proposito (nao resolve sigla isolada como Brasil, pra
  // nao reabrir o bug do LOUIS DREYFUS RO=Romenia), mas aqui o risco de
  // fechar vaga BR real ativa pesa mais que a certeza automatica.
  const { service } = createFixture([
    {
      id: "job-xp",
      title: "Analista de Dados",
      country: "SP",
      state: null,
      status: "active",
      company: { name: "XP Inc." },
      jobSource: { sourceUrl: "https://www.xpinc.com/oportunidades" },
    },
  ]);

  return service.preview().then((preview) => {
    assert.equal(preview.foreign.length, 0);
    assert.deepEqual(
      preview.ambiguous.map((f) => f.jobId),
      ["job-xp"],
    );
  });
});

test("preview NAO trata como ambiguo quando o state corrobora um pais estrangeiro real (ex: IN-HAUS: country=PA, state=Panama)", () => {
  const { service } = createFixture([
    {
      id: "job-inhaus-panama",
      title: "Data Engineer & BI Specialist",
      country: "PA",
      state: "Panama",
      status: "inactive",
      company: { name: "IN-HAUS INDUSTRIAL" },
      jobSource: { sourceUrl: "https://inhaus.teamtailor.com/" },
    },
  ]);

  return service.preview().then((preview) => {
    assert.deepEqual(
      preview.foreign.map((f) => f.jobId),
      ["job-inhaus-panama"],
    );
    assert.equal(preview.ambiguous.length, 0);
  });
});

test("apply em dry-run nao grava nada; apply real fecha so as estrangeiras confirmadas, nunca as ambiguas", async () => {
  const { service, updateManyCalls } = createFixture([
    {
      id: "job-foreign",
      title: "Vaga estrangeira",
      country: "United States",
      state: null,
      status: "active",
      company: { name: "Twilio Brasil" },
      jobSource: { sourceUrl: "https://boards.greenhouse.io/twilio" },
    },
    {
      id: "job-ambiguous",
      title: "Vaga BR com bug de parsing",
      country: "MG",
      state: null,
      status: "inactive",
      company: { name: "Inter" },
      jobSource: {
        sourceUrl: "https://job-boards.greenhouse.io/inter/jobs/123",
      },
    },
  ]);

  const dryRunSummary = await service.apply({ dryRun: true });
  assert.equal(dryRunSummary.removed, 1);
  assert.equal(dryRunSummary.skippedAmbiguous, 1);
  assert.equal(updateManyCalls.length, 0);

  const applySummary = await service.apply({ dryRun: false });
  assert.equal(applySummary.removed, 1);
  assert.equal(applySummary.skippedAmbiguous, 1);
  assert.equal(updateManyCalls.length, 1);
  assert.deepEqual(updateManyCalls[0]?.ids, ["job-foreign"]);
});
