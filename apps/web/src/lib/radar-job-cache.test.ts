// @vitest-environment node
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildJobMetadata } from "@/app/radar/[slug]/job-detail";
import nextConfig from "../../next.config";
import { proxy } from "../proxy";
import {
  APP_ACCESS_TOKEN_COOKIE_NAME,
  APP_REFRESH_TOKEN_COOKIE_NAME,
} from "./app-session";
import type { PublicJob } from "./public-jobs-api";
import {
  fetchPublicJob,
  fetchPublicJobCached,
  fetchPublicSimilarJobsCached,
  PublicApiError,
} from "./public-jobs-client";
import {
  JOB_SLUG_PATTERN,
  jobCacheTag,
  PUBLIC_JOB_REVALIDATE_SECONDS,
  SIMILAR_JOBS_CACHE_TAG,
} from "./radar-cache";

const APP_DIR = join(__dirname, "..", "app");

// Código-fonte sem comentários (o scanner de imports não deve tropeçar em
// texto explicativo que cita cookies()/apiRequest de propósito).
function readCode(path: string) {
  return readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

async function getRewrite() {
  const rewrites = (await nextConfig.rewrites?.()) as {
    beforeFiles: Array<{
      destination: string;
      missing?: Array<{ key: string; type: string }>;
      source: string;
    }>;
  };
  return rewrites.beforeFiles[0];
}

// Converte o `source` do Next (path-to-regexp) para RegExp de teste.
function sourceToRegExp(source: string) {
  const inner = source.replace("/radar/:slug", "");
  return new RegExp(`^/radar/${inner}$`);
}

describe("rewrite do detalhe anônimo", () => {
  it("só reescreve quando NENHUM cookie de sessão está presente", async () => {
    const rule = await getRewrite();

    expect(rule.destination).toBe("/radar-pub/:slug");
    expect(rule.missing?.every((m) => m.type === "cookie")).toBe(true);
    expect(rule.missing?.map((m) => m.key).sort()).toEqual(
      [APP_ACCESS_TOKEN_COOKIE_NAME, APP_REFRESH_TOKEN_COOKIE_NAME].sort(),
    );
  });

  it("captura slugs de vaga e nunca as rotas reservadas de /radar", async () => {
    const regexp = sourceToRegExp((await getRewrite()).source);

    expect(regexp.test("/radar/analista-de-dados-acme-abc123")).toBe(true);
    expect(regexp.test("/radar/junior")).toBe(false);
    expect(regexp.test("/radar/remotas")).toBe(false);
    expect(regexp.test("/radar/senior")).toBe(false);
    // rotas de 2+ segmentos nunca casam
    expect(regexp.test("/radar/area/data_ai")).toBe(false);
    expect(regexp.test("/radar/empresa/acme")).toBe(false);
    // slugs que só COMEÇAM com um nome reservado continuam sendo vagas
    expect(regexp.test("/radar/junior-analista-x-123")).toBe(true);
  });

  it("todo segmento estático de /radar com page.tsx está excluído do rewrite", async () => {
    const regexp = sourceToRegExp((await getRewrite()).source);
    const radarDir = join(APP_DIR, "radar");
    const reserved = readdirSync(radarDir).filter((name) => {
      if (name.startsWith("[") || name.startsWith("_")) return false;
      const dir = join(radarDir, name);
      return (
        statSync(dir).isDirectory() &&
        readdirSync(dir).some((f) => f === "page.tsx")
      );
    });

    expect(reserved.length).toBeGreaterThan(0);
    for (const segment of reserved) {
      expect(regexp.test(`/radar/${segment}`), `/radar/${segment}`).toBe(false);
    }
  });
});

describe("rota interna /radar-pub", () => {
  it("acesso direto devolve 404 sem cache", () => {
    for (const url of [
      "https://www.earlycv.com.br/radar-pub/vaga-x",
      "https://www.earlycv.com.br/radar-pub",
      "https://www.earlycv.com.br/radar-pub/vaga-x?_rsc=abc",
    ]) {
      const response = proxy({ url } as never);
      expect(response.status).toBe(404);
      expect(response.headers.get("cache-control")).toBe("no-store");
    }
  });

  it("não usa noindex nem X-Robots-Tag em lugar nenhum (URL pública é indexável)", async () => {
    const page = readCode(join(APP_DIR, "radar-pub", "[slug]", "page.tsx"));
    expect(page).not.toMatch(/noindex/i);
    expect(readCode(join(__dirname, "..", "proxy.ts"))).not.toMatch(
      /x-robots-tag/i,
    );

    const headerRules = ((await nextConfig.headers?.()) ?? []).flatMap(
      (rule) => [rule.source, ...rule.headers.map((h) => h.key.toLowerCase())],
    );
    expect(headerRules.join(" ")).not.toContain("radar-pub");
  });

  it("não importa nada que leia cookies/sessão (nada de usuário entra no cache)", () => {
    const page = readCode(join(APP_DIR, "radar-pub", "[slug]", "page.tsx"));
    const forbidden = [
      "next/headers",
      "cookies(",
      "headers(",
      "app-session",
      "api-request",
      "apiRequest",
      "getCurrentAppUser",
      "plans-api",
      "resumes-api",
      "radar-api",
      "searchParams",
    ];
    for (const token of forbidden) {
      expect(page, token).not.toContain(token);
    }
    // job-detail é compartilhado: o que é "de usuário" chega só via `viewer`,
    // que a rota pública sempre passa como null.
    expect(page).toContain("viewer={null}");
  });

  it("literal de revalidate bate com a constante compartilhada", () => {
    const page = readFileSync(
      join(APP_DIR, "radar-pub", "[slug]", "page.tsx"),
      "utf8",
    );
    expect(page).toContain(
      `export const revalidate = ${PUBLIC_JOB_REVALIDATE_SECONDS};`,
    );
  });
});

describe("metadata do detalhe (compartilhada pelas duas rotas)", () => {
  const job = {
    company: "Acme",
    location: "São Paulo, SP",
    slug: "analista-acme-1",
    technologies: ["sql", "python"],
    title: "Analista",
    workModel: "remote",
  } as unknown as PublicJob;

  it("vaga ativa: canonical na URL pública e sem robots (indexável)", () => {
    const metadata = buildJobMetadata(job);

    expect(metadata.alternates?.canonical).toBe(
      "https://www.earlycv.com.br/radar/analista-acme-1",
    );
    expect(metadata.robots).toBeUndefined();
    expect(metadata.title).toBe("Analista — Acme | EarlyCV");
  });

  it("vaga inexistente/inativa: noindex", () => {
    expect(buildJobMetadata(null).robots).toEqual({
      follow: false,
      index: false,
    });
  });
});

describe("cliente de dados públicos", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function stubFetch(make: () => Response) {
    const fetchMock = vi.fn(async (..._args: unknown[]) => make());
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  it("nunca envia Cookie/Authorization e omite credenciais", async () => {
    const fetchMock = stubFetch(
      () => new Response(JSON.stringify({ slug: "a" }), { status: 200 }),
    );

    await fetchPublicJobCached("a");

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    const headers = Object.keys(init.headers as Record<string, string>).map(
      (h) => h.toLowerCase(),
    );
    expect(headers).toEqual(["accept"]);
    expect(init.credentials).toBe("omit");
  });

  it("cached: TTL de 300s e tag por vaga; similares com tag própria", async () => {
    const fetchMock = stubFetch(
      () => new Response(JSON.stringify({ data: [] }), { status: 200 }),
    );

    await fetchPublicJobCached("vaga-x");
    await fetchPublicSimilarJobsCached();

    const first = fetchMock.mock.calls[0][1] as { next: unknown };
    const second = fetchMock.mock.calls[1][1] as { next: unknown };
    expect(first.next).toEqual({
      revalidate: 300,
      tags: [jobCacheTag("vaga-x")],
    });
    expect(second.next).toEqual({
      revalidate: 300,
      tags: [SIMILAR_JOBS_CACHE_TAG],
    });
  });

  it("no-store: sem cache e sem tags", async () => {
    const fetchMock = stubFetch(() => new Response("{}", { status: 200 }));

    await fetchPublicJob("vaga-x", { kind: "no-store" });

    const init = fetchMock.mock.calls[0][1] as RequestInit & { next?: unknown };
    expect(init.cache).toBe("no-store");
    expect(init.next).toBeUndefined();
  });

  it("404 vira not-found; 5xx e falha de rede LANÇAM (não viram 404 em cache)", async () => {
    stubFetch(() => new Response("", { status: 404 }));
    await expect(fetchPublicJobCached("x")).resolves.toEqual({
      status: "not-found",
    });

    stubFetch(() => new Response("", { status: 503 }));
    await expect(fetchPublicJobCached("x")).rejects.toBeInstanceOf(
      PublicApiError,
    );

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("fetch failed");
      }),
    );
    await expect(fetchPublicJobCached("x")).rejects.toThrow("fetch failed");
  });

  it("codifica o slug na URL", async () => {
    const fetchMock = stubFetch(() => new Response("{}", { status: 200 }));
    await fetchPublicJobCached("a/b?c");
    expect(String(fetchMock.mock.calls[0][0])).toContain(
      "/public/jobs/a%2Fb%3Fc",
    );
  });
});

describe("JOB_SLUG_PATTERN", () => {
  it("aceita slugs reais e recusa lixo", () => {
    expect(JOB_SLUG_PATTERN.test("analista-de-dados-acme-abc123")).toBe(true);
    expect(JOB_SLUG_PATTERN.test("../etc/passwd")).toBe(false);
    expect(JOB_SLUG_PATTERN.test("")).toBe(false);
    expect(JOB_SLUG_PATTERN.test("a".repeat(300))).toBe(false);
  });
});
