import assert from "node:assert/strict";
import { test } from "node:test";
import { BraveSearchProvider } from "./brave-search.provider";

function withMockFetch<T>(
  handler: (url: URL) => { json?: unknown; ok?: boolean; status?: number },
  run: () => Promise<T>,
) {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.BRAVE_SEARCH_API_KEY;
  process.env.BRAVE_SEARCH_API_KEY = "test-key";

  globalThis.fetch = (async (input: URL | RequestInfo) => {
    const url = new URL(typeof input === "string" ? input : input.toString());
    const entry = handler(url);
    const status = entry.status ?? 200;
    return {
      json: async () => entry.json ?? {},
      ok: entry.ok ?? (status >= 200 && status < 300),
      status,
    } as Response;
  }) as typeof fetch;

  return run().finally(() => {
    globalThis.fetch = originalFetch;
    process.env.BRAVE_SEARCH_API_KEY = originalKey;
  });
}

test("BraveSearchProvider mapeia title/url/description da resposta", async () => {
  const provider = new BraveSearchProvider();

  const results = await withMockFetch(
    () => ({
      json: {
        web: {
          results: [
            {
              description: "Vagas abertas no Banco Safra",
              title: "Trabalhe conosco | Banco Safra",
              url: "https://venhasersafra.gupy.io/",
            },
            { title: "Sem url", url: "" },
          ],
        },
      },
    }),
    () => provider.search("Banco Safra vagas", 10),
  );

  assert.equal(results.length, 1);
  assert.equal(results[0]?.title, "Trabalhe conosco | Banco Safra");
  assert.equal(results[0]?.url, "https://venhasersafra.gupy.io/");
  assert.equal(results[0]?.snippet, "Vagas abertas no Banco Safra");
});

test("BraveSearchProvider lança erro tipado em HTTP não-ok", async () => {
  const provider = new BraveSearchProvider();

  await assert.rejects(
    () => withMockFetch(() => ({ status: 429 }), () => provider.search("x", 10)),
    /HTTP 429/,
  );
});

test("BraveSearchProvider lança erro claro sem API key configurada", async () => {
  const provider = new BraveSearchProvider();
  const originalKey = process.env.BRAVE_SEARCH_API_KEY;
  process.env.BRAVE_SEARCH_API_KEY = "";

  try {
    await assert.rejects(() => provider.search("x", 10), /not configured/);
  } finally {
    process.env.BRAVE_SEARCH_API_KEY = originalKey;
  }
});
