import assert from "node:assert/strict";
import { test } from "node:test";

import { ProductUpdatesService } from "./product-updates.service";

function setStatus<T extends { status: string }>(
  store: Map<string, T>,
  id: string,
  status: string,
): void {
  const current = store.get(id);
  assert.ok(current, `${id} must exist in fixture`);
  store.set(id, { ...current, status });
}

type FakeProductUpdate = {
  id: string;
  internalName: string;
  subject: string;
  preheader: string | null;
  content: string;
  primaryButtonText: string | null;
  primaryButtonUrl: string | null;
  optionalFooterContent: string | null;
  htmlSnapshot: string | null;
  textSnapshot: string | null;
  audience: string | null;
  status: string;
  recipientCount: number;
  testSentAt: Date | null;
  testSentBy: string | null;
  testRecipientEmail: string | null;
  createdBy: string;
  startedBy: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  cancelledAt: Date | null;
  failedAt: Date | null;
};

function createFixture(options: {
  enabled: boolean;
  sendTestResult?: { sent: true } | { sent: false; errorMessage: string };
  eligibleRecipients?: Array<{ userId: string; email: string; name: string }>;
}) {
  const store = new Map<string, FakeProductUpdate>();
  const deliveries: Array<{ productUpdateId: string; userId: string }> = [];

  function makeBase(id: string): FakeProductUpdate {
    return {
      id,
      internalName: "Campanha teste",
      subject: "Assunto",
      preheader: null,
      content: "Conteúdo",
      primaryButtonText: null,
      primaryButtonUrl: null,
      optionalFooterContent: null,
      htmlSnapshot: null,
      textSnapshot: null,
      audience: null,
      status: "DRAFT",
      recipientCount: 0,
      testSentAt: null,
      testSentBy: null,
      testRecipientEmail: null,
      createdBy: "admin-1",
      startedBy: null,
      startedAt: null,
      completedAt: null,
      cancelledAt: null,
      failedAt: null,
    };
  }
  store.set("pu-1", makeBase("pu-1"));

  const database = {
    productUpdate: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        store.get(where.id) ?? null,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const record = { ...makeBase("pu-new"), ...data } as FakeProductUpdate;
        store.set(record.id, record);
        return record;
      },
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: Record<string, unknown>;
      }) => {
        const current = store.get(where.id);
        assert.ok(current, `product update ${where.id} must exist`);
        const next = { ...current, ...data } as FakeProductUpdate;
        store.set(where.id, next);
        return next;
      },
      // Semântica de UPDATE...WHERE condicional do Postgres: check-e-muta
      // SÍNCRONO dentro do corpo (nenhum `await` antes de ler/escrever o
      // Map) — é isso que faz o teste de start() concorrente (dois
      // Promise.all) se comportar como a corrida real: quem chega
      // primeiro na chamada muda o status e ganha count=1; quem chega
      // depois lê o status já mudado e ganha count=0, sem nunca escrever
      // nada.
      updateMany: ({
        where,
        data,
      }: {
        where: { id: string; status?: string };
        data: Record<string, unknown>;
      }) => {
        const current = store.get(where.id);
        if (!current) return Promise.resolve({ count: 0 });
        if (where.status !== undefined && current.status !== where.status) {
          return Promise.resolve({ count: 0 });
        }
        store.set(where.id, { ...current, ...data } as FakeProductUpdate);
        return Promise.resolve({ count: 1 });
      },
    },
    productUpdateDelivery: {
      createMany: async ({
        data,
      }: {
        data: Array<Record<string, unknown>>;
      }) => {
        for (const item of data) {
          deliveries.push(item as { productUpdateId: string; userId: string });
        }
        return { count: data.length };
      },
      updateMany: async () => ({ count: 0 }),
    },
    $transaction: async (fn: (tx: typeof database) => unknown) => fn(database),
    // biome-ignore lint/suspicious/noExplicitAny: fake mínimo pro teste
  } as any;

  const emailService = {
    sendTest: async () => options.sendTestResult ?? { sent: true },
    // biome-ignore lint/suspicious/noExplicitAny: fake mínimo pro teste
  } as any;

  const subscriptionService = {
    countEligibleRecipients: async () =>
      (options.eligibleRecipients ?? []).length,
    resolveEligibleRecipients: async () => options.eligibleRecipients ?? [],
    // biome-ignore lint/suspicious/noExplicitAny: fake mínimo pro teste
  } as any;

  const templateService = {
    render: () => ({ html: "<html/>", text: "text" }),
    // biome-ignore lint/suspicious/noExplicitAny: fake mínimo pro teste
  } as any;

  const funnelEvents = {
    record: async () => {},
    // biome-ignore lint/suspicious/noExplicitAny: fake mínimo pro teste
  } as any;

  const service = new ProductUpdatesService(
    database,
    { PRODUCT_UPDATES_ENABLED: options.enabled },
    emailService,
    subscriptionService,
    templateService,
    funnelEvents,
  );

  return { service, store, deliveries };
}

test("markReady recusa DRAFT -> READY sem testSentAt — trava no backend", async () => {
  const { service } = createFixture({ enabled: true });
  await assert.rejects(() => service.markReady("pu-1"), /envie um teste/);
});

test("sendTest bem-sucedido preenche testSentAt/testSentBy/testRecipientEmail e libera markReady", async () => {
  const { service, store } = createFixture({ enabled: true });

  await service.sendTest("pu-1", "admin@earlycv.com.br", "admin-1");
  const afterTest = store.get("pu-1");
  assert.ok(afterTest?.testSentAt);
  assert.equal(afterTest?.testSentBy, "admin-1");
  assert.equal(afterTest?.testRecipientEmail, "admin@earlycv.com.br");

  const ready = await service.markReady("pu-1");
  assert.equal(ready.status, "READY");
});

test("editar um campo de conteúdo depois do teste zera os campos de teste e reverte READY -> DRAFT", async () => {
  const { service, store } = createFixture({ enabled: true });

  await service.sendTest("pu-1", "admin@earlycv.com.br", "admin-1");
  await service.markReady("pu-1");
  assert.equal(store.get("pu-1")?.status, "READY");

  await service.updateContent("pu-1", { subject: "Novo assunto" });

  const afterEdit = store.get("pu-1");
  assert.equal(afterEdit?.status, "DRAFT");
  assert.equal(afterEdit?.testSentAt, null);
  assert.equal(afterEdit?.testSentBy, null);
  assert.equal(afterEdit?.testRecipientEmail, null);
});

test("editar sem mudar nenhum CONTENT_FIELD não invalida o teste nem mexe no status", async () => {
  const { service, store } = createFixture({ enabled: true });

  await service.sendTest("pu-1", "admin@earlycv.com.br", "admin-1");
  await service.markReady("pu-1");

  await service.updateContent("pu-1", { subject: "Assunto" }); // valor idêntico ao atual

  const after = store.get("pu-1");
  assert.equal(after?.status, "READY");
  assert.ok(after?.testSentAt);
});

test("sendTest e start recusam quando PRODUCT_UPDATES_ENABLED=false", async () => {
  const { service } = createFixture({ enabled: false });

  await assert.rejects(
    () => service.sendTest("pu-1", "x@y.com", "admin-1"),
    /PRODUCT_UPDATES_ENABLED/,
  );
  await assert.rejects(
    () =>
      service.start("pu-1", {
        audience: "ALL_ELIGIBLE_USERS",
        confirmedRecipientCount: 0,
        startedBy: "admin-1",
      }),
    /PRODUCT_UPDATES_ENABLED/,
  );
});

test("start recusa quando a contagem confirmada não bate com o recálculo — nunca confia num número desatualizado", async () => {
  const { service, store } = createFixture({
    enabled: true,
    eligibleRecipients: [{ userId: "u1", email: "u1@x.com", name: "U1" }],
  });
  setStatus(store, "pu-1", "READY");

  await assert.rejects(
    () =>
      service.start("pu-1", {
        audience: "ALL_ELIGIBLE_USERS",
        confirmedRecipientCount: 5,
        startedBy: "admin-1",
      }),
    /contagem de elegíveis mudou/,
  );
});

test("start cria uma ProductUpdateDelivery por destinatário e congela o snapshot", async () => {
  const { service, store, deliveries } = createFixture({
    enabled: true,
    eligibleRecipients: [
      { userId: "u1", email: "u1@x.com", name: "U1" },
      { userId: "u2", email: "u2@x.com", name: "U2" },
    ],
  });
  setStatus(store, "pu-1", "READY");

  const result = await service.start("pu-1", {
    audience: "ALL_ELIGIBLE_USERS",
    confirmedRecipientCount: 2,
    startedBy: "admin-1",
  });

  assert.equal(result.status, "SENDING");
  assert.equal(result.recipientCount, 2);
  assert.ok(result.htmlSnapshot);
  assert.ok(result.textSnapshot);
  assert.equal(deliveries.length, 2);
});

test("cancel só é permitido a partir de SENDING", async () => {
  const { service } = createFixture({ enabled: true });
  await assert.rejects(() => service.cancel("pu-1", "admin-1"), /SENDING/);
});

// C1 — regressão do bug de corrida: duas chamadas concorrentes de start()
// para a MESMA campanha nunca podem ambas "vencer". A transição
// READY->SENDING é uma aquisição atômica (updateMany where status=READY);
// quem perde a corrida nunca toca a campanha nem cria deliveries, e
// principalmente NUNCA marca a campanha como FAILED (bug original: o
// catch fazia isso incondicionalmente, sobrescrevendo o SENDING que a
// chamada vencedora acabara de commitar).
test("start concorrente: só uma chamada vence, nenhuma duplica deliveries, a perdedora nunca marca FAILED", async () => {
  const { service, store, deliveries } = createFixture({
    enabled: true,
    eligibleRecipients: [
      { userId: "u1", email: "u1@x.com", name: "U1" },
      { userId: "u2", email: "u2@x.com", name: "U2" },
    ],
  });
  setStatus(store, "pu-1", "READY");

  const input = {
    audience: "ALL_ELIGIBLE_USERS" as const,
    confirmedRecipientCount: 2,
    startedBy: "admin-1",
  };

  const [resultA, resultB] = await Promise.allSettled([
    service.start("pu-1", input),
    service.start("pu-1", input),
  ]);

  const outcomes = [resultA, resultB];
  const fulfilled = outcomes.filter((r) => r.status === "fulfilled");
  const rejected = outcomes.filter((r) => r.status === "rejected");

  // Exatamente uma chamada venceu, a outra foi recusada (nunca as duas
  // fulfilled, nunca as duas rejected).
  assert.equal(fulfilled.length, 1);
  assert.equal(rejected.length, 1);

  const winner = fulfilled[0] as PromiseFulfilledResult<
    Awaited<ReturnType<typeof service.start>>
  >;
  assert.equal(winner.value.status, "SENDING");

  const loser = rejected[0] as PromiseRejectedResult;
  assert.doesNotMatch(String(loser.reason), /\bFAILED\b/);
  assert.match(String(loser.reason), /já foi iniciada/);

  // Só um conjunto de deliveries foi criado (2, não 4) — nenhuma
  // duplicidade.
  assert.equal(deliveries.length, 2);

  // Estado final da campanha é SENDING — a chamada perdedora não deixou
  // rastro nenhum (nunca escreveu FAILED nem qualquer outro status).
  assert.equal(store.get("pu-1")?.status, "SENDING");
});

test("botão precisa ser um par: create recusa texto sem URL", async () => {
  const { service } = createFixture({ enabled: true });
  await assert.rejects(
    () =>
      service.create({
        internalName: "Campanha",
        subject: "Assunto",
        content: "Conteúdo",
        primaryButtonText: "Ver mais",
        createdBy: "admin-1",
      }),
    /precisam estar presentes juntos/,
  );
});

test("botão precisa ser um par: create recusa URL sem texto", async () => {
  const { service } = createFixture({ enabled: true });
  await assert.rejects(
    () =>
      service.create({
        internalName: "Campanha",
        subject: "Assunto",
        content: "Conteúdo",
        primaryButtonUrl: "https://earlycv.com.br/x",
        createdBy: "admin-1",
      }),
    /precisam estar presentes juntos/,
  );
});

test("create recusa primaryButtonUrl insegura mesmo se o DTO já tiver deixado passar — service nunca confia só no DTO", async () => {
  const { service } = createFixture({ enabled: true });
  await assert.rejects(
    () =>
      service.create({
        internalName: "Campanha",
        subject: "Assunto",
        content: "Conteúdo",
        primaryButtonText: "Ver mais",
        primaryButtonUrl: "javascript:alert(1)",
        createdBy: "admin-1",
      }),
    /URL absoluta https/,
  );
});

test("updateContent valida o par considerando o valor já salvo, não só o patch", async () => {
  const { service } = createFixture({ enabled: true });
  await service.create({
    internalName: "Campanha",
    subject: "Assunto",
    content: "Conteúdo",
    createdBy: "admin-1",
  });

  // pu-1 (fixture base) não tem botão nenhum — só mandar a URL sem texto
  // deveria falhar.
  await assert.rejects(
    () =>
      service.updateContent("pu-1", {
        primaryButtonUrl: "https://earlycv.com.br/x",
      }),
    /precisam estar presentes juntos/,
  );
});
