import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";

import { WebRevalidationService } from "./web-revalidation.service";

type Call = {
  body: { reason: string; slug: string };
  headers: Record<string, string>;
  signal?: AbortSignal;
};

const realFetch = globalThis.fetch;

function installFetch(handler: (call: Call) => Promise<Response> | Response) {
  const calls: Call[] = [];
  globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
    const call: Call = {
      body: JSON.parse(String(init?.body)),
      headers: init?.headers as Record<string, string>,
      signal: init?.signal as AbortSignal | undefined,
    };
    calls.push(call);
    return handler(call);
  }) as typeof fetch;
  return calls;
}

function enable() {
  process.env.WEB_REVALIDATE_URL = "https://web.example.com/api/revalidate/job";
  process.env.WEB_REVALIDATE_SECRET = "segredo";
}

describe("WebRevalidationService", () => {
  beforeEach(() => enable());
  afterEach(() => {
    globalThis.fetch = realFetch;
    delete process.env.WEB_REVALIDATE_URL;
    delete process.env.WEB_REVALIDATE_SECRET;
  });

  it("fica desligado (no-op) sem URL ou segredo", async () => {
    delete process.env.WEB_REVALIDATE_SECRET;
    const calls = installFetch(() => new Response("{}"));
    const service = new WebRevalidationService();

    service.requestJobRevalidation("vaga-x", "inactivated");
    await service.idle();

    assert.equal(service.isEnabled(), false);
    assert.equal(calls.length, 0);
  });

  it("envia POST com segredo em header, motivo e slug; ignora slug vazio", async () => {
    const calls = installFetch(() => new Response("{}", { status: 200 }));
    const service = new WebRevalidationService();

    service.requestJobRevalidation("vaga-x", "published");
    service.requestJobRevalidation(null, "published");
    service.requestJobRevalidation("", "published");
    await service.idle();

    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].body, { reason: "published", slug: "vaga-x" });
    assert.equal(calls[0].headers["x-revalidate-secret"], "segredo");
    assert.ok(
      calls[0].signal instanceof AbortSignal,
      "toda chamada tem timeout",
    );
  });

  it("nunca lança e o request retorna na hora, mesmo com o webhook fora do ar", async () => {
    installFetch(() => {
      throw new TypeError("fetch failed");
    });
    const service = new WebRevalidationService();

    const started = Date.now();
    assert.doesNotThrow(() =>
      service.requestJobRevalidation("vaga-x", "updated"),
    );
    assert.ok(Date.now() - started < 50, "enfileirar é síncrono e instantâneo");
    await service.idle();
  });

  it("'updated' não repete; 4xx não repete; 5xx de inativação repete uma vez", async () => {
    let calls = installFetch(() => new Response("", { status: 503 }));
    let service = new WebRevalidationService();
    service.requestJobRevalidation("a", "updated");
    await service.idle();
    assert.equal(calls.length, 1, "updated: 1 tentativa");

    calls = installFetch(() => new Response("", { status: 401 }));
    service = new WebRevalidationService();
    service.requestJobRevalidation("b", "inactivated");
    await service.idle();
    assert.equal(calls.length, 1, "4xx (segredo errado): sem retry");

    calls = installFetch(() => new Response("", { status: 503 }));
    service = new WebRevalidationService();
    service.requestJobRevalidation("c", "inactivated");
    await service.idle();
    assert.equal(calls.length, 2, "5xx em inativação: 1 retry");
  });

  it("limita a concorrência e coalesce a mesma vaga pelo motivo mais forte", async () => {
    let running = 0;
    let maxRunning = 0;
    const releases: Array<() => void> = [];
    const calls = installFetch(
      () =>
        new Promise<Response>((resolve) => {
          running += 1;
          maxRunning = Math.max(maxRunning, running);
          releases.push(() => {
            running -= 1;
            resolve(new Response("{}", { status: 200 }));
          });
        }),
    );
    const service = new WebRevalidationService();

    for (let i = 0; i < 4; i += 1)
      service.requestJobRevalidation(`ocupa-${i}`, "updated");
    // as 4 vagas acima ocupam todos os slots; estas ficam na fila:
    service.requestJobRevalidation("mesma", "updated");
    service.requestJobRevalidation("mesma", "inactivated");
    service.requestJobRevalidation("mesma", "updated");

    assert.equal(maxRunning, 4);
    while (releases.length > 0) {
      releases.shift()?.();
      await new Promise((resolve) => setImmediate(resolve));
    }
    await service.idle();

    const forMesma = calls.filter((c) => c.body.slug === "mesma");
    assert.equal(forMesma.length, 1, "a mesma vaga vira uma única chamada");
    assert.equal(forMesma[0].body.reason, "inactivated");
    assert.ok(maxRunning <= 4);
  });

  it("fila cheia descarta o excedente sem lançar (o TTL cobre)", async () => {
    const releases: Array<() => void> = [];
    installFetch(
      () =>
        new Promise<Response>((resolve) => {
          releases.push(() => resolve(new Response("{}")));
        }),
    );
    const service = new WebRevalidationService();

    assert.doesNotThrow(() => {
      for (let i = 0; i < 2_100; i += 1)
        service.requestJobRevalidation(`v-${i}`, "updated");
    });

    const queue = (service as unknown as { queue: Map<string, string> }).queue;
    assert.ok(queue.size <= 2_000, `fila limitada (tem ${queue.size})`);

    // libera tudo para o teste terminar
    while (releases.length > 0 || queue.size > 0) {
      releases.shift()?.();
      await new Promise((resolve) => setImmediate(resolve));
    }
    await service.idle();
  });

  it("nunca vaza o segredo nos logs de falha", async () => {
    installFetch(() => new Response("", { status: 500 }));
    const service = new WebRevalidationService();
    const logged: string[] = [];
    (service as unknown as { logger: { warn: (m: string) => void } }).logger = {
      warn: (message: string) => logged.push(message),
    };

    service.requestJobRevalidation("vaga-x", "updated");
    await service.idle();

    assert.ok(logged.length >= 1);
    assert.ok(logged.every((line) => !line.includes("segredo")));
  });
});
