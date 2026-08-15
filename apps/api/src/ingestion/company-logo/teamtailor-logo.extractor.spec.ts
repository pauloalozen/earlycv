import assert from "node:assert/strict";
import { test } from "node:test";

import { fetchTeamtailorCompanyLogo } from "./teamtailor-logo.extractor";

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

test("fetchTeamtailorCompanyLogo extrai o img do CDN logotype-v3, ignorando o banner de og:image", async () => {
  const { restore, calls } = mockFetch(() => ({
    ok: true,
    text: async () =>
      `<html><head>
        <meta property="og:image" content="https://screenshots.teamtailor-cdn.com/abc-facebook.png" />
      </head><body>
        <img alt="Site de carreiras de Loft" src="https://images.teamtailor-cdn.com/images/s3/teamtailor-production/logotype-v3/image_uploads/28e63a72/original.png" />
      </body></html>`,
  }));

  try {
    const logoUrl = await fetchTeamtailorCompanyLogo(
      "https://loft.teamtailor.com/jobs",
    );

    assert.equal(
      logoUrl,
      "https://images.teamtailor-cdn.com/images/s3/teamtailor-production/logotype-v3/image_uploads/28e63a72/original.png",
    );
    assert.equal(calls[0], "https://loft.teamtailor.com/jobs");
  } finally {
    restore();
  }
});

test("fetchTeamtailorCompanyLogo funciona mesmo apos redirect pra dominio customizado (fetch segue redirect)", async () => {
  // O mock nao simula o redirect em si (fetch() ja resolve isso por fora),
  // so confirma que o parsing funciona igual independente do host final.
  const { restore } = mockFetch(() => ({
    ok: true,
    text: async () =>
      '<img alt="Página de vacantes de Ripio" src="https://images.teamtailor-cdn.com/images/s3/teamtailor-production/logotype-v3/image_uploads/f6fa6e1d/original.png" />',
  }));

  try {
    const logoUrl = await fetchTeamtailorCompanyLogo(
      "https://ripio.teamtailor.com/jobs",
    );
    assert.equal(
      logoUrl,
      "https://images.teamtailor-cdn.com/images/s3/teamtailor-production/logotype-v3/image_uploads/f6fa6e1d/original.png",
    );
  } finally {
    restore();
  }
});

test("fetchTeamtailorCompanyLogo devolve null quando nao encontra img do CDN logotype-v3", async () => {
  const { restore } = mockFetch(() => ({
    ok: true,
    text: async () => "<html><body>sem logo aqui</body></html>",
  }));

  try {
    const logoUrl = await fetchTeamtailorCompanyLogo(
      "https://acme.teamtailor.com/jobs",
    );
    assert.equal(logoUrl, null);
  } finally {
    restore();
  }
});

test("fetchTeamtailorCompanyLogo devolve null quando a pagina responde erro (board removido)", async () => {
  const { restore } = mockFetch(() => ({ ok: false, status: 404 }));

  try {
    const logoUrl = await fetchTeamtailorCompanyLogo(
      "https://acme.teamtailor.com/jobs",
    );
    assert.equal(logoUrl, null);
  } finally {
    restore();
  }
});

test("fetchTeamtailorCompanyLogo rejeita sourceUrl que nao aponta pra {subdomain}.teamtailor.com", async () => {
  await assert.rejects(() =>
    fetchTeamtailorCompanyLogo("https://acme.gupy.io/jobs"),
  );
});
