import assert from "node:assert/strict";
import { test } from "node:test";

import { CompanyLogoFetchService } from "./company-logo-fetch.service";

// 2x2 PNG valido (base64) — grande o suficiente pra falhar a checagem de
// tamanho minimo (64px), usado pra exercitar o caminho "logo pequeno
// demais" sem depender de rede.
const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAEUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

function createFixture(jobSource: Record<string, unknown> | null) {
  const companyUpdates: Array<Record<string, unknown>> = [];
  const database = {
    jobSource: {
      findFirst: async () => jobSource,
    },
    company: {
      update: async ({ data }: { data: Record<string, unknown> }) => {
        companyUpdates.push(data);
        return { id: "company-1", ...data };
      },
    },
  };

  const service = new CompanyLogoFetchService(database as never);
  return { companyUpdates, service };
}

function mockFetch(
  responses: Array<(input?: unknown, init?: RequestInit) => unknown>,
) {
  const originalFetch = globalThis.fetch;
  let index = 0;
  globalThis.fetch = (async (input?: unknown, init?: RequestInit) => {
    const factory = responses[index] ?? responses[responses.length - 1];
    index += 1;
    return factory?.(input, init);
  }) as typeof fetch;
  return () => {
    globalThis.fetch = originalFetch;
  };
}

test("fetchLogoForCompany marca skipped quando empresa nao tem fonte suportada", async () => {
  const { service, companyUpdates } = createFixture(null);

  const result = await service.fetchLogoForCompany("company-1");

  assert.equal(result.status, "skipped");
  assert.equal(companyUpdates.length, 1);
  assert.equal(companyUpdates[0]?.logoUrl, undefined);
  assert.ok(companyUpdates[0]?.logoFetchedAt instanceof Date);
});

test("fetchLogoForCompany marca skipped quando adapter da fonte nao tem extractor", async () => {
  const { service, companyUpdates } = createFixture({
    id: "source-1",
    sourceType: "talentbrew",
    sourceUrl: "https://carreiras.acme.com.br/busca-de-vagas",
  });

  const result = await service.fetchLogoForCompany("company-1");

  assert.equal(result.status, "skipped");
  assert.equal(companyUpdates.length, 1);
});

test("fetchLogoForCompany falha quando o extractor nao acha logo na pagina", async () => {
  const { service, companyUpdates } = createFixture({
    id: "source-1",
    sourceType: "gupy",
    sourceUrl: "https://acme.gupy.io/jobs",
  });

  const restore = mockFetch([
    () => ({
      ok: true,
      text: async () => "<html><body>sem logo aqui</body></html>",
    }),
  ]);

  try {
    const result = await service.fetchLogoForCompany("company-1");

    assert.equal(result.status, "failed");
    if (result.status === "failed") {
      assert.match(result.errorSummary, /não encontrado/);
    }
    assert.equal(companyUpdates.length, 1);
    assert.equal(companyUpdates[0]?.logoUrl, undefined);
  } finally {
    restore();
  }
});

test("fetchLogoForCompany falha quando o logo encontrado e pequeno demais", async () => {
  const { service, companyUpdates } = createFixture({
    id: "source-1",
    sourceType: "gupy",
    sourceUrl: "https://acme.gupy.io/jobs",
  });

  const bytes = Buffer.from(TINY_PNG_BASE64, "base64");
  const restore = mockFetch([
    () => ({
      ok: true,
      text: async () =>
        '<img alt="Logotipo Acme" src="https://attachments.gupy.io/acme/logo.png">',
    }),
    () => ({
      ok: true,
      arrayBuffer: async () =>
        bytes.buffer.slice(
          bytes.byteOffset,
          bytes.byteOffset + bytes.byteLength,
        ),
    }),
  ]);

  try {
    const result = await service.fetchLogoForCompany("company-1");

    assert.equal(result.status, "failed");
    if (result.status === "failed") {
      assert.match(result.errorSummary, /pequeno demais/);
    }
    assert.equal(companyUpdates.length, 1);
    assert.equal(companyUpdates[0]?.logoUrl, undefined);
  } finally {
    restore();
  }
});

test("fetchLogoForCompany grava logoUrl quando extractor acha logo com dimensoes boas", async () => {
  const { service, companyUpdates } = createFixture({
    id: "source-1",
    sourceType: "gupy",
    sourceUrl: "https://acme.gupy.io/jobs",
  });

  // PNG 100x100 gerado sinteticamente: header + IHDR com width/height=100
  // — a checagem de dimensao so le os primeiros bytes (assinatura PNG +
  // IHDR), nao precisa ser uma imagem renderizavel de verdade.
  const png = buildFakePng(100, 100);
  const restore = mockFetch([
    () => ({
      ok: true,
      text: async () =>
        '<img alt="Logotipo Acme" src="https://attachments.gupy.io/acme/logo.png">',
    }),
    () => ({
      ok: true,
      arrayBuffer: async () =>
        png.buffer.slice(png.byteOffset, png.byteOffset + png.byteLength),
    }),
  ]);

  try {
    const result = await service.fetchLogoForCompany("company-1");

    assert.equal(result.status, "completed");
    if (result.status === "completed") {
      assert.equal(result.logoUrl, "https://attachments.gupy.io/acme/logo.png");
    }
    assert.equal(companyUpdates.length, 1);
    assert.equal(
      companyUpdates[0]?.logoUrl,
      "https://attachments.gupy.io/acme/logo.png",
    );
  } finally {
    restore();
  }
});

test("fetchLogoForCompany usa User-Agent de navegador só pra baixar a imagem de hosts que bloqueiam bot (files.inhire.app)", async () => {
  const { service } = createFixture({
    id: "source-1",
    sourceType: "inhire",
    sourceUrl: "https://acme.inhire.app/vagas",
  });

  const png = buildFakePng(100, 100);
  const capturedHeaders: Array<HeadersInit | undefined> = [];
  const restore = mockFetch([
    () => ({
      ok: true,
      text: async () =>
        '<meta property="og:image" content="https://files.inhire.app/og-images/acme.png" />',
    }),
    (_input?: unknown, init?: RequestInit) => {
      capturedHeaders.push(init?.headers);
      return {
        ok: true,
        arrayBuffer: async () =>
          png.buffer.slice(png.byteOffset, png.byteOffset + png.byteLength),
      };
    },
  ]);

  try {
    const result = await service.fetchLogoForCompany("company-1");

    assert.equal(result.status, "completed");
    const userAgent = (
      capturedHeaders[0] as Record<string, string> | undefined
    )?.["User-Agent"];
    assert.match(userAgent ?? "", /Mozilla/);
  } finally {
    restore();
  }
});

function buildFakePng(width: number, height: number): Buffer {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // bit depth
  ihdrData[9] = 6; // color type (RGBA)
  const ihdrType = Buffer.from("IHDR");
  const ihdrLength = Buffer.alloc(4);
  ihdrLength.writeUInt32BE(ihdrData.length, 0);
  // CRC nao e validado pela lib de leitura de dimensoes — 4 bytes zerados bastam.
  const ihdrCrc = Buffer.alloc(4);
  return Buffer.concat([signature, ihdrLength, ihdrType, ihdrData, ihdrCrc]);
}
