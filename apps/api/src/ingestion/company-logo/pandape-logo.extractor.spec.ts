import assert from "node:assert/strict";
import { test } from "node:test";

import { fetchPandapeCompanyLogo } from "./pandape-logo.extractor";

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

test("fetchPandapeCompanyLogo extrai o src do img com classe brand-image, ignorando outros img", async () => {
  const { restore, calls } = mockFetch(() => ({
    ok: true,
    text: async () =>
      `<html><body>
        <header>
          <a class="align-self-center mr-20" href="/">
            <img class="img-fluid brand-image" src="https://empbraatsstorage.blob.core.windows.net/atslogos/f8271cff-222e-446a-b930-6f5e46531eb5_4.png" width="120" height="64" alt="CSU DIGITAL" />
          </a>
          <img width="43" height="32" alt="PORTUGUÊS" class="ml-auto" src="/images/flags/pt.svg" />
        </header>
        <footer>Powered by Pandapé</footer>
      </body></html>`,
  }));

  try {
    const logoUrl = await fetchPandapeCompanyLogo(
      "https://csudigital.pandape.com.br",
    );

    assert.equal(
      logoUrl,
      "https://empbraatsstorage.blob.core.windows.net/atslogos/f8271cff-222e-446a-b930-6f5e46531eb5_4.png",
    );
    assert.equal(calls[0], "https://csudigital.pandape.com.br/");
  } finally {
    restore();
  }
});

test("fetchPandapeCompanyLogo devolve null quando a empresa usa microsite whitelabel sem a classe brand-image", async () => {
  const { restore } = mockFetch(() => ({
    ok: true,
    text: async () =>
      `<html><body>
        <img src="https://ii.ct-stc.com/40/whitelabel/15229/logo.png" style="max-width: 166px;" alt="logo">
      </body></html>`,
  }));

  try {
    const logoUrl = await fetchPandapeCompanyLogo(
      "https://tendaatacado.pandape.infojobs.com.br",
    );
    assert.equal(logoUrl, null);
  } finally {
    restore();
  }
});

test("fetchPandapeCompanyLogo devolve null quando a pagina responde erro", async () => {
  const { restore } = mockFetch(() => ({ ok: false, status: 404 }));

  try {
    const logoUrl = await fetchPandapeCompanyLogo(
      "https://acme.pandape.com.br",
    );
    assert.equal(logoUrl, null);
  } finally {
    restore();
  }
});

test("fetchPandapeCompanyLogo rejeita sourceUrl invalida", async () => {
  await assert.rejects(() => fetchPandapeCompanyLogo("not-a-url"));
});
