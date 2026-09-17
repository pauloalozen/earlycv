import assert from "node:assert/strict";
import { test } from "node:test";

import { fetchEightfoldCompanyLogo } from "./eightfold-logo.extractor";

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

test("fetchEightfoldCompanyLogo (modo direto, tema novo) extrai navBar.image da config HTML-entity-encoded", async () => {
  const { restore, calls } = mockFetch(() => ({
    ok: true,
    text: async () =>
      `<html><body>
        <div data-config="{&#34;companyName&#34;: &#34;Vale&#34;, &#34;navBar&#34;: {&#34;opacity&#34;: 1, &#34;image&#34;: &#34;https://static.vscdn.net/images/careers/demo/vale/Vale_w.png&#34;, &#34;link&#34;: &#34;https://vale.com&#34;}}"></div>
      </body></html>`,
  }));

  try {
    const logoUrl = await fetchEightfoldCompanyLogo(
      "https://vale.eightfold.ai/careers",
    );

    assert.equal(
      logoUrl,
      "https://static.vscdn.net/images/careers/demo/vale/Vale_w.png",
    );
    assert.equal(calls[0], "https://vale.eightfold.ai/careers");
  } finally {
    restore();
  }
});

test("fetchEightfoldCompanyLogo (modo direto, tema antigo) extrai o src do img alt=eightfold-logo", async () => {
  const { restore } = mockFetch(() => ({
    ok: true,
    text: async () =>
      `<html><body>
        <div class="navbar-header">
          <a href="/careers">
            <img src="https://static.vscdn.net/images/careers/demo/eaton/1713796137::eatonfr" alt="eightfold-logo">
          </a>
        </div>
      </body></html>`,
  }));

  try {
    const logoUrl = await fetchEightfoldCompanyLogo(
      "https://eaton.eightfold.ai/careers",
    );

    assert.equal(
      logoUrl,
      "https://static.vscdn.net/images/careers/demo/eaton/1713796137::eatonfr",
    );
  } finally {
    restore();
  }
});

test("fetchEightfoldCompanyLogo (modo proxy) extrai apple-touch-icon quando presente", async () => {
  const { restore, calls } = mockFetch(() => ({
    ok: true,
    text: async () =>
      `<html><head>
        <link rel="apple-touch-icon" sizes="180x180" href="/static/images/favicon/apple-touch-icon.png">
        <meta property="og:image" content="https://careers-meli.mercadolibre.com/static/images/og-default.png">
      </head><body></body></html>`,
  }));

  try {
    const logoUrl = await fetchEightfoldCompanyLogo(
      "https://careers-meli.mercadolibre.com/pt/positions",
    );

    assert.equal(
      logoUrl,
      "https://careers-meli.mercadolibre.com/static/images/favicon/apple-touch-icon.png",
    );
    assert.equal(calls[0], "https://careers-meli.mercadolibre.com");
  } finally {
    restore();
  }
});

test("fetchEightfoldCompanyLogo (modo proxy) cai pro og:image quando nao ha apple-touch-icon", async () => {
  const { restore } = mockFetch(() => ({
    ok: true,
    text: async () =>
      `<html><head>
        <meta property="og:image" content="https://careers-meli.mercadolibre.com/static/images/og-default.png">
      </head><body></body></html>`,
  }));

  try {
    const logoUrl = await fetchEightfoldCompanyLogo(
      "https://careers-meli.mercadolibre.com/pt/positions",
    );

    assert.equal(
      logoUrl,
      "https://careers-meli.mercadolibre.com/static/images/og-default.png",
    );
  } finally {
    restore();
  }
});

test("fetchEightfoldCompanyLogo devolve null quando nao acha nenhum padrao conhecido", async () => {
  const { restore } = mockFetch(() => ({
    ok: true,
    text: async () => `<html><body>sem logo aqui</body></html>`,
  }));

  try {
    const logoUrl = await fetchEightfoldCompanyLogo(
      "https://vale.eightfold.ai/careers",
    );
    assert.equal(logoUrl, null);
  } finally {
    restore();
  }
});

test("fetchEightfoldCompanyLogo devolve null quando a pagina responde erro", async () => {
  const { restore } = mockFetch(() => ({ ok: false, status: 403 }));

  try {
    const logoUrl = await fetchEightfoldCompanyLogo(
      "https://eaton.eightfold.ai/careers",
    );
    assert.equal(logoUrl, null);
  } finally {
    restore();
  }
});
