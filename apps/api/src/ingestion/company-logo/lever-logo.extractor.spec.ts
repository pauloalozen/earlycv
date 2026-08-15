import assert from "node:assert/strict";
import { test } from "node:test";

import { fetchLeverCompanyLogo } from "./lever-logo.extractor";

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

test("fetchLeverCompanyLogo extrai o logo da empresa, ignorando o logo do rodape do Lever", async () => {
  const { restore, calls } = mockFetch(() => ({
    ok: true,
    text: async () =>
      `<html><body>
        <img alt="Despegar logo" src="https://lever-client-logos.s3.us-west-2.amazonaws.com/fcb74b6d-1736970008540.png">
        <img alt="Lever logo" src="/img/lever-logo-refresh.svg" class="footer-logo">
      </body></html>`,
  }));

  try {
    const logoUrl = await fetchLeverCompanyLogo(
      "https://jobs.lever.co/despegar",
    );

    assert.equal(
      logoUrl,
      "https://lever-client-logos.s3.us-west-2.amazonaws.com/fcb74b6d-1736970008540.png",
    );
    assert.equal(calls[0], "https://jobs.lever.co/despegar");
  } finally {
    restore();
  }
});

test("fetchLeverCompanyLogo extrai slug tanto da URL da API quanto da pagina publica", async () => {
  const { restore, calls } = mockFetch(() => ({
    ok: true,
    text: async () =>
      '<img alt="CI&T logo" src="https://lever-client-logos.s3.us-west-2.amazonaws.com/bd60685b.png">',
  }));

  try {
    const logoUrl = await fetchLeverCompanyLogo(
      "https://api.lever.co/v0/postings/ciandt",
    );
    assert.equal(
      logoUrl,
      "https://lever-client-logos.s3.us-west-2.amazonaws.com/bd60685b.png",
    );
    assert.equal(calls[0], "https://jobs.lever.co/ciandt");
  } finally {
    restore();
  }
});

test("fetchLeverCompanyLogo devolve null quando nao encontra img do bucket de logos", async () => {
  const { restore } = mockFetch(() => ({
    ok: true,
    text: async () =>
      '<img alt="Lever logo" src="/img/lever-logo-refresh.svg" class="footer-logo">',
  }));

  try {
    const logoUrl = await fetchLeverCompanyLogo("https://jobs.lever.co/acme");
    assert.equal(logoUrl, null);
  } finally {
    restore();
  }
});

test("fetchLeverCompanyLogo devolve null quando a pagina responde erro (board removido)", async () => {
  const { restore } = mockFetch(() => ({ ok: false, status: 404 }));

  try {
    const logoUrl = await fetchLeverCompanyLogo("https://jobs.lever.co/acme");
    assert.equal(logoUrl, null);
  } finally {
    restore();
  }
});

test("fetchLeverCompanyLogo rejeita sourceUrl que nao e reconhecivel", async () => {
  await assert.rejects(() =>
    fetchLeverCompanyLogo("https://acme.gupy.io/jobs"),
  );
});
