import assert from "node:assert/strict";
import { test } from "node:test";

import { fetchGreenhouseCompanyLogo } from "./greenhouse-logo.extractor";

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

test("fetchGreenhouseCompanyLogo extrai o src do img com alt terminando em Logo (template moderno)", async () => {
  const { restore, calls } = mockFetch(() => ({
    ok: true,
    text: async () =>
      `<html><body>
        <img src="/assets/banner.png" alt="Banner">
        <img alt="Nubank Logo" src="https://job-boards.cdn.greenhouse.io/nubank/logo.png">
      </body></html>`,
  }));

  try {
    const logoUrl = await fetchGreenhouseCompanyLogo(
      "https://boards-api.greenhouse.io/v1/boards/nubank/jobs",
    );

    assert.equal(
      logoUrl,
      "https://job-boards.cdn.greenhouse.io/nubank/logo.png",
    );
    assert.equal(calls[0], "https://job-boards.greenhouse.io/nubank");
  } finally {
    restore();
  }
});

test("fetchGreenhouseCompanyLogo devolve null no template antigo (banner sem alt estruturado)", async () => {
  const { restore } = mockFetch(() => ({
    ok: true,
    text: async () =>
      '<img style="max-width:100%" src="https://static.example.com/banner-banco-pan.png" alt="" width="1222">',
  }));

  try {
    const logoUrl = await fetchGreenhouseCompanyLogo(
      "https://job-boards.greenhouse.io/bancopan",
    );
    assert.equal(logoUrl, null);
  } finally {
    restore();
  }
});

test("fetchGreenhouseCompanyLogo devolve null quando a pagina responde erro (ex: board removido)", async () => {
  const { restore } = mockFetch(() => ({ ok: false, status: 404 }));

  try {
    const logoUrl = await fetchGreenhouseCompanyLogo(
      "https://job-boards.greenhouse.io/monashees",
    );
    assert.equal(logoUrl, null);
  } finally {
    restore();
  }
});

test("fetchGreenhouseCompanyLogo aceita as 3 formas de sourceUrl (API, job-boards, boards legado)", async () => {
  const { restore } = mockFetch(() => ({
    ok: true,
    text: async () =>
      '<img alt="Acme Logo" src="https://cdn.example.com/acme.png">',
  }));

  try {
    for (const sourceUrl of [
      "https://boards-api.greenhouse.io/v1/boards/acme/jobs",
      "https://job-boards.greenhouse.io/acme",
      "https://boards.greenhouse.io/acme",
    ]) {
      const logoUrl = await fetchGreenhouseCompanyLogo(sourceUrl);
      assert.equal(logoUrl, "https://cdn.example.com/acme.png");
    }
  } finally {
    restore();
  }
});

test("fetchGreenhouseCompanyLogo rejeita sourceUrl que nao e reconhecivel", async () => {
  await assert.rejects(() =>
    fetchGreenhouseCompanyLogo("https://acme.gupy.io/jobs"),
  );
});
