import assert from "node:assert/strict";
import { test } from "node:test";

import { fetchAshbyCompanyLogo } from "./ashby-logo.extractor";

function mockFetch(handler: (url: string) => unknown) {
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = (async (input: URL | RequestInfo) => {
    const url = typeof input === "string" ? input : input.toString();
    calls.push(url);
    return handler(url);
  }) as typeof fetch;
  return {
    calls,
    restore() {
      globalThis.fetch = originalFetch;
    },
  };
}

test("fetchAshbyCompanyLogo extrai o content do meta og:image quando a empresa configurou org theme", async () => {
  const { restore, calls } = mockFetch(() => ({
    ok: true,
    text: async () =>
      `<html><head>
        <meta property="og:title" content="Nubank Jobs" />
        <meta property="og:image" content="https://app.ashbyhq.com/api/images/org-theme-social/abc/def/ghi.png" />
      </head></html>`,
  }));

  try {
    const logoUrl = await fetchAshbyCompanyLogo(
      "https://jobs.ashbyhq.com/nubank",
    );
    assert.equal(
      logoUrl,
      "https://app.ashbyhq.com/api/images/org-theme-social/abc/def/ghi.png",
    );
    assert.equal(calls[0], "https://jobs.ashbyhq.com/nubank");
  } finally {
    restore();
  }
});

test("fetchAshbyCompanyLogo devolve null quando a empresa nao configurou org theme (sem og:image)", async () => {
  const { restore } = mockFetch(() => ({
    ok: true,
    text: async () =>
      `<html><head>
        <meta property="og:title" content="Vercel Jobs" />
        <link rel="apple-touch-icon" href="https://cdn.ashbyprd.com/cdn_assets/generic/apple-touch-icon.png" />
      </head></html>`,
  }));

  try {
    const logoUrl = await fetchAshbyCompanyLogo(
      "https://jobs.ashbyhq.com/vercel",
    );
    assert.equal(logoUrl, null);
  } finally {
    restore();
  }
});

test("fetchAshbyCompanyLogo devolve null quando a pagina responde erro", async () => {
  const { restore } = mockFetch(() => ({ ok: false, status: 404 }));

  try {
    const logoUrl = await fetchAshbyCompanyLogo(
      "https://jobs.ashbyhq.com/acme",
    );
    assert.equal(logoUrl, null);
  } finally {
    restore();
  }
});

test("fetchAshbyCompanyLogo extrai slug tanto da URL da API quanto da pagina publica", async () => {
  const { restore, calls } = mockFetch(() => ({
    ok: true,
    text: async () =>
      '<meta property="og:image" content="https://app.ashbyhq.com/api/images/org-theme-logo/x.png" />',
  }));

  try {
    const logoUrl = await fetchAshbyCompanyLogo(
      "https://api.ashbyhq.com/posting-api/job-board/acme",
    );
    assert.equal(
      logoUrl,
      "https://app.ashbyhq.com/api/images/org-theme-logo/x.png",
    );
    assert.equal(calls[0], "https://jobs.ashbyhq.com/acme");
  } finally {
    restore();
  }
});

test("fetchAshbyCompanyLogo rejeita sourceUrl que nao e reconhecivel", async () => {
  await assert.rejects(() =>
    fetchAshbyCompanyLogo("https://acme.gupy.io/jobs"),
  );
});
