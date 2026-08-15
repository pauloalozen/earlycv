import assert from "node:assert/strict";
import { test } from "node:test";

import { fetchInHireCompanyLogo } from "./inhire-logo.extractor";

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

test("fetchInHireCompanyLogo extrai o content do meta og:image, independente da ordem dos atributos", async () => {
  const { restore, calls } = mockFetch(() => ({
    ok: true,
    text: async () =>
      `<html><head>
        <meta property="og:title" content="Cielo" />
        <meta content="https://files.inhire.app/og-images/cielo.png" property="og:image" />
      </head><body></body></html>`,
  }));

  try {
    const logoUrl = await fetchInHireCompanyLogo(
      "https://cielo.inhire.app/vagas",
    );

    assert.equal(logoUrl, "https://files.inhire.app/og-images/cielo.png");
    assert.equal(calls[0], "https://cielo.inhire.app/vagas");
  } finally {
    restore();
  }
});

test("fetchInHireCompanyLogo devolve null quando nao encontra meta og:image", async () => {
  const { restore } = mockFetch(() => ({
    ok: true,
    text: async () => "<html><head></head><body>sem og:image</body></html>",
  }));

  try {
    const logoUrl = await fetchInHireCompanyLogo(
      "https://acme.inhire.app/vagas",
    );
    assert.equal(logoUrl, null);
  } finally {
    restore();
  }
});

test("fetchInHireCompanyLogo devolve null quando a pagina responde erro", async () => {
  const { restore } = mockFetch(() => ({ ok: false, status: 404 }));

  try {
    const logoUrl = await fetchInHireCompanyLogo(
      "https://acme.inhire.app/vagas",
    );
    assert.equal(logoUrl, null);
  } finally {
    restore();
  }
});

test("fetchInHireCompanyLogo rejeita sourceUrl que nao aponta pra {slug}.inhire.app", async () => {
  await assert.rejects(() =>
    fetchInHireCompanyLogo("https://boards.greenhouse.io/acme"),
  );
});
