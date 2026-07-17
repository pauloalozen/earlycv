import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";
import type OpenAI from "openai";
import {
  extractMasterCvCanonicalProfile,
  type MasterCvCanonicalExtractionInput,
  type MasterCvCanonicalExtractionOutput,
} from "./master-cv-canonical-extraction.js";

function createValidOutput(): MasterCvCanonicalExtractionOutput {
  return {
    canonicalProfile: {
      fullName: "Ana Silva",
      headline: "Senior Data Analyst",
      email: "ana@example.com",
      phone: "+55 11 90000-0000",
      linkedinUrl: "https://linkedin.com/in/anasilva",
      location: {
        city: "Sao Paulo",
        state: "SP",
        country: "Brasil",
      },
      professionalSummary: "Atua com analytics e BI.",
      experiences: [
        {
          role: "Senior Data Analyst",
          company: "Acme",
          location: "Sao Paulo",
          startDate: "2022-01",
          endDate: null,
          bullets: ["Criou dashboards executivos"],
          technologies: ["SQL", "Power BI"],
        },
      ],
      education: [
        {
          institution: "USP",
          degree: "Bacharelado",
          fieldOfStudy: "Estatistica",
          startDate: "2015-01",
          endDate: "2019-12",
        },
      ],
      skills: ["SQL", "Stakeholder management", "Comunicacao"],
      languages: [{ language: "Portugues", level: "Nativo" }],
      certifications: [
        { name: "Google Data Analytics", issuer: "Google", year: "2023" },
      ],
    },
    extractionCoverage: {
      identifiedFields: ["fullName", "email"],
      missingFields: ["linkedinUrl"],
      fieldStatus: {
        fullName: "filled",
        linkedinUrl: "missing",
      },
    },
    confidence: {
      fullName: 0.98,
    },
    evidence: {
      fullName: ["Ana Silva"],
    },
  };
}

// Gera um PDF minimo, mas com texto suficiente para passar pelo pdf-parse real
// (extractTextFromPdf exige >= 100 caracteres extraidos). pdf.js (usado pelo
// pdf-parse) recupera o documento por varredura de objetos mesmo sem xref table.
function createTestPdfBuffer(text: string): Buffer {
  const escaped = text.replace(/([()\\])/g, "\\$1");
  const content = `BT /F1 12 Tf 100 700 Td (${escaped}) Tj ET`;
  const pdf = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 4 0 R >> >> /MediaBox [0 0 612 792] /Contents 5 0 R >>
endobj
4 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
5 0 obj
<< /Length ${content.length} >>
stream
${content}
endstream
endobj
trailer
<< /Size 6 /Root 1 0 R >>
%%EOF`;
  return Buffer.from(pdf);
}

const SAMPLE_CV_TEXT =
  "Ana Silva - Senior Data Analyst - ana@example.com - Experiencia profissional em analytics, dashboards e stakeholder management por mais de 6 anos.";

function createFileInput(
  buffer = createTestPdfBuffer(SAMPLE_CV_TEXT),
): NonNullable<MasterCvCanonicalExtractionInput["file"]> {
  return {
    buffer,
    originalname: "ana-silva.pdf",
    mimetype: "application/pdf",
    size: buffer.length,
  };
}

function mockChatCompletion(content: string) {
  return mock.fn(async () => ({
    choices: [{ message: { content } }],
  }));
}

describe("extractMasterCvCanonicalProfile", () => {
  it("returns structured canonicalProfile output from a raw file payload", async () => {
    const mockOutput = createValidOutput();
    const file = createFileInput();
    const chatCompletionsCreate = mockChatCompletion(
      JSON.stringify(mockOutput),
    );

    const mockClient = {
      chat: { completions: { create: chatCompletionsCreate } },
    } as unknown as OpenAI;

    // masterCvText é passado junto com file para evitar depender do parser real
    // de PDF neste teste (já coberto por pdf-parser.spec.ts e pelos testes do
    // worker) — resolveMasterCvText prioriza masterCvText sobre file, mas o
    // áudito ainda registra os metadados de file normalmente.
    const { output } = await extractMasterCvCanonicalProfile(
      mockClient,
      "gpt-4.1-mini",
      { file, masterCvText: SAMPLE_CV_TEXT, locale: "pt-BR" },
    );

    assert.equal(output.canonicalProfile.fullName, "Ana Silva");
    assert.equal(output.extractionCoverage.fieldStatus.fullName, "filled");
    assert.deepEqual(output.canonicalProfile.skills, [
      "SQL",
      "Stakeholder management",
      "Comunicacao",
    ]);
    assert.equal(chatCompletionsCreate.mock.calls.length, 1);

    const request = chatCompletionsCreate.mock.calls[0]?.arguments[0] as {
      messages: Array<{ role: string; content: string }>;
      response_format?: { type?: string };
    };

    // O PDF nao vai mais nativo pro modelo: o texto e extraido localmente
    // (pdf-parse) e enviado como mensagem de texto, compativel com qualquer supplier.
    assert.equal(request.response_format?.type, "json_object");
    assert.equal(request.messages[0]?.role, "system");
    assert.equal(request.messages[1]?.role, "user");
    assert.match(request.messages[1]?.content ?? "", /Ana Silva/);
  });

  it("stores file metadata in the audit payload", async () => {
    const mockOutput = createValidOutput();
    const file = createFileInput();
    const chatCompletionsCreate = mockChatCompletion(
      JSON.stringify(mockOutput),
    );

    const mockClient = {
      chat: { completions: { create: chatCompletionsCreate } },
    } as unknown as OpenAI;

    // masterCvText junto com file pelo mesmo motivo do teste acima: evita o
    // parser real de PDF, mantendo a cobertura de metadados de file no áudito.
    const { audit } = await extractMasterCvCanonicalProfile(
      mockClient,
      "gpt-4.1-mini",
      { file, masterCvText: SAMPLE_CV_TEXT, locale: "pt-BR" },
    );

    const requestInput = JSON.parse(audit.request.input) as {
      originalInput: {
        locale: string;
        file: { originalname: string; mimetype: string; size: number } | null;
      };
      sentToModel: {
        locale: string;
        masterCvText: string;
      };
    };

    assert.equal(
      requestInput.originalInput.file?.originalname,
      "ana-silva.pdf",
    );
    assert.equal(requestInput.sentToModel.locale, "pt-BR");
    assert.match(requestInput.sentToModel.masterCvText, /Ana Silva/);
  });

  it("accepts only filled|partial|missing fieldStatus values", async () => {
    const mockClient = {
      chat: {
        completions: {
          create: mockChatCompletion(
            JSON.stringify({
              canonicalProfile: {
                fullName: null,
                headline: null,
                email: null,
                phone: null,
                linkedinUrl: null,
                location: { city: null, state: null, country: null },
                professionalSummary: null,
                experiences: [],
                education: [],
                skills: { technical: [], business: [], soft: [] },
                languages: [],
                certifications: [],
              },
              extractionCoverage: {
                identifiedFields: [],
                missingFields: ["fullName"],
                fieldStatus: { fullName: "unknown" },
              },
              confidence: {},
              evidence: {},
            }),
          ),
        },
      },
    } as unknown as OpenAI;

    await assert.rejects(
      () =>
        extractMasterCvCanonicalProfile(mockClient, "gpt-4.1-mini", {
          masterCvText: SAMPLE_CV_TEXT,
        }),
      /fieldStatus|filled|partial|missing/i,
    );
  });

  it("rejects malformed JSON responses", async () => {
    const mockClient = {
      chat: {
        completions: { create: mockChatCompletion("{ invalid json") },
      },
    } as unknown as OpenAI;

    await assert.rejects(
      () =>
        extractMasterCvCanonicalProfile(mockClient, "gpt-4.1-mini", {
          masterCvText: SAMPLE_CV_TEXT,
        }),
      /JSON|parse/i,
    );
  });

  it("rejects confidence values outside [0,1] and non-finite numbers", async () => {
    for (const invalidValue of [
      Number.NaN,
      Number.POSITIVE_INFINITY,
      -0.1,
      1.2,
    ]) {
      const invalidOutput = createValidOutput();
      invalidOutput.confidence.fullName = invalidValue;

      const mockClient = {
        chat: {
          completions: {
            create: mockChatCompletion(JSON.stringify(invalidOutput)),
          },
        },
      } as unknown as OpenAI;

      await assert.rejects(
        () =>
          extractMasterCvCanonicalProfile(mockClient, "gpt-4.1-mini", {
            masterCvText: SAMPLE_CV_TEXT,
          }),
        /confidence|0|1|finite/i,
      );
    }
  });

  it("rejects unknown fieldStatus keys", async () => {
    const invalidOutput = createValidOutput();
    invalidOutput.extractionCoverage.fieldStatus["not.a.real.field"] = "filled";

    const mockClient = {
      chat: {
        completions: {
          create: mockChatCompletion(JSON.stringify(invalidOutput)),
        },
      },
    } as unknown as OpenAI;

    await assert.rejects(
      () =>
        extractMasterCvCanonicalProfile(mockClient, "gpt-4.1-mini", {
          masterCvText: SAMPLE_CV_TEXT,
        }),
      /fieldStatus|unknown/i,
    );
  });

  it("rejects non-string evidence entries", async () => {
    const invalidOutput = createValidOutput() as unknown as {
      evidence: Record<string, unknown>;
    };
    invalidOutput.evidence.fullName = ["Ana Silva", 123];

    const mockClient = {
      chat: {
        completions: {
          create: mockChatCompletion(JSON.stringify(invalidOutput)),
        },
      },
    } as unknown as OpenAI;

    await assert.rejects(
      () =>
        extractMasterCvCanonicalProfile(mockClient, "gpt-4.1-mini", {
          masterCvText: SAMPLE_CV_TEXT,
        }),
      /evidence|string\[\]/i,
    );
  });
});
