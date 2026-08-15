import assert from "node:assert/strict";
import { test } from "node:test";

import { fetchGupyCompanyLogo } from "./gupy-logo.extractor";

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

test("fetchGupyCompanyLogo extrai o src do img com alt Logotipo, ignorando outros img", async () => {
  const { restore, calls } = mockFetch(() => ({
    ok: true,
    text: async () =>
      `<html><body>
        <img src="/assets/hero.png" alt="Banner">
        <img alt="Logotipo Raízen" src="https://attachments.gupy.io/production/companies/1934/career/3476/images/logo.png">
        <footer>Powered by Gupy</footer>
      </body></html>`,
  }));

  try {
    const logoUrl = await fetchGupyCompanyLogo(
      "https://genteraizen.gupy.io/api/v1/jobs",
    );

    assert.equal(
      logoUrl,
      "https://attachments.gupy.io/production/companies/1934/career/3476/images/logo.png",
    );
    assert.equal(calls[0], "https://genteraizen.gupy.io/");
  } finally {
    restore();
  }
});

test("fetchGupyCompanyLogo devolve null quando nao encontra img com alt Logotipo", async () => {
  const { restore } = mockFetch(() => ({
    ok: true,
    text: async () => "<html><body>sem logo</body></html>",
  }));

  try {
    const logoUrl = await fetchGupyCompanyLogo(
      "https://acme.gupy.io/api/v1/jobs",
    );
    assert.equal(logoUrl, null);
  } finally {
    restore();
  }
});

test("fetchGupyCompanyLogo devolve null quando a pagina responde erro", async () => {
  const { restore } = mockFetch(() => ({ ok: false, status: 404 }));

  try {
    const logoUrl = await fetchGupyCompanyLogo(
      "https://acme.gupy.io/api/v1/jobs",
    );
    assert.equal(logoUrl, null);
  } finally {
    restore();
  }
});

test("fetchGupyCompanyLogo rejeita sourceUrl que nao aponta pra {subdomain}.gupy.io", async () => {
  await assert.rejects(() =>
    fetchGupyCompanyLogo("https://boards.greenhouse.io/acme"),
  );
});
