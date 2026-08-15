import assert from "node:assert/strict";
import { test } from "node:test";

import { fetchWorkdayCompanyLogo } from "./workday-logo.extractor";

function mockFetch(handler: (url: string, init?: RequestInit) => unknown) {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; method?: string }> = [];
  globalThis.fetch = (async (input: URL | RequestInfo, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    calls.push({ url, method: init?.method });
    return handler(url, init);
  }) as typeof fetch;
  return {
    calls,
    restore() {
      globalThis.fetch = originalFetch;
    },
  };
}

test("fetchWorkdayCompanyLogo constroi a URL previsivel /assets/logo e confirma com HEAD", async () => {
  const { restore, calls } = mockFetch(() => ({ ok: true }));

  try {
    const logoUrl = await fetchWorkdayCompanyLogo(
      "https://mastercard.wd1.myworkdayjobs.com/CorporateCareers",
    );

    assert.equal(
      logoUrl,
      "https://mastercard.wd1.myworkdayjobs.com/CorporateCareers/assets/logo",
    );
    assert.equal(calls[0]?.method, "HEAD");
  } finally {
    restore();
  }
});

test("fetchWorkdayCompanyLogo preserva prefixo de locale no path", async () => {
  const { restore, calls } = mockFetch(() => ({ ok: true }));

  try {
    const logoUrl = await fetchWorkdayCompanyLogo(
      "https://santander.wd3.myworkdayjobs.com/pt-BR/SantanderCareers",
    );

    assert.equal(
      logoUrl,
      "https://santander.wd3.myworkdayjobs.com/pt-BR/SantanderCareers/assets/logo",
    );
    assert.equal(
      calls[0]?.url,
      "https://santander.wd3.myworkdayjobs.com/pt-BR/SantanderCareers/assets/logo",
    );
  } finally {
    restore();
  }
});

test("fetchWorkdayCompanyLogo devolve null quando o HEAD falha (site em manutencao ou slug removido)", async () => {
  const { restore } = mockFetch(() => ({ ok: false, status: 500 }));

  try {
    const logoUrl = await fetchWorkdayCompanyLogo(
      "https://acme.wd5.myworkdayjobs.com/careers",
    );
    assert.equal(logoUrl, null);
  } finally {
    restore();
  }
});

test("fetchWorkdayCompanyLogo rejeita sourceUrl fora do dominio myworkdayjobs.com (site customizado)", async () => {
  await assert.rejects(() =>
    fetchWorkdayCompanyLogo("https://careers.playstation.com/"),
  );
});
