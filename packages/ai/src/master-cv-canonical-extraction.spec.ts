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
      skills: {
        technical: ["SQL"],
        business: ["Stakeholder management"],
        soft: ["Comunicacao"],
      },
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

function createFileInput(
  buffer = Buffer.from("%PDF-1.7 fake cv bytes"),
): NonNullable<MasterCvCanonicalExtractionInput["file"]> {
  return {
    buffer,
    originalname: "ana-silva.pdf",
    mimetype: "application/pdf",
    size: buffer.length,
  };
}

describe("extractMasterCvCanonicalProfile", () => {
  it("returns structured canonicalProfile output from a raw file payload", async () => {
    const mockOutput = createValidOutput();
    const file = createFileInput();
    const responsesCreate = mock.fn(async () => ({
      output_text: JSON.stringify(mockOutput),
    }));

    const mockClient = {
      responses: {
        create: responsesCreate,
      },
    } as unknown as OpenAI;

    const { output } = await extractMasterCvCanonicalProfile(
      mockClient,
      "gpt-4.1-mini",
      { file, locale: "pt-BR" },
    );

    assert.equal(output.canonicalProfile.fullName, "Ana Silva");
    assert.equal(output.extractionCoverage.fieldStatus.fullName, "filled");
    assert.deepEqual(output.canonicalProfile.skills.technical, ["SQL"]);
    assert.equal(responsesCreate.mock.calls.length, 1);

    const request = responsesCreate.mock.calls[0]?.arguments[0] as {
      input: Array<{
        role: string;
        content: Array<{
          type: string;
          filename?: string;
          file_data?: string;
          text?: string;
        }>;
      }>;
      text?: { format?: { type?: string } };
    };

    assert.equal(request.text?.format?.type, "json_object");
    assert.equal(request.input[0]?.content[0]?.type, "input_file");
    assert.equal(request.input[0]?.content[0]?.filename, "ana-silva.pdf");
    assert.equal(request.input[0]?.content[1]?.type, "input_text");
  });

  it("stores file metadata in the audit payload", async () => {
    const mockOutput = createValidOutput();
    const file = createFileInput(
      Buffer.from("%PDF-1.7 fake cv bytes for audit"),
    );
    const responsesCreate = mock.fn(async () => ({
      output_text: JSON.stringify(mockOutput),
    }));

    const mockClient = {
      responses: {
        create: responsesCreate,
      },
    } as unknown as OpenAI;

    const { audit } = await extractMasterCvCanonicalProfile(
      mockClient,
      "gpt-4.1-mini",
      { file, locale: "pt-BR" },
    );

    const requestInput = JSON.parse(audit.request.input) as {
      originalInput: {
        locale: string;
        file: { originalname: string; mimetype: string; size: number } | null;
      };
      sentToModel: {
        locale: string;
        file: {
          filename: string;
          mimetype: string;
          size: number;
          fileDataLength: number;
        } | null;
      };
    };

    assert.equal(
      requestInput.originalInput.file?.originalname,
      "ana-silva.pdf",
    );
    assert.equal(requestInput.sentToModel.locale, "pt-BR");
    assert.equal(requestInput.sentToModel.file?.filename, "ana-silva.pdf");
    assert.equal(
      requestInput.sentToModel.file?.fileDataLength,
      file.buffer.toString("base64").length,
    );
  });

  it("accepts only filled|partial|missing fieldStatus values", async () => {
    const mockClient = {
      responses: {
        create: mock.fn(async () => ({
          output_text: JSON.stringify({
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
        })),
      },
    } as unknown as OpenAI;

    await assert.rejects(
      () =>
        extractMasterCvCanonicalProfile(mockClient, "gpt-4.1-mini", {
          file: createFileInput(),
        }),
      /fieldStatus|filled|partial|missing/i,
    );
  });

  it("rejects malformed JSON responses", async () => {
    const mockClient = {
      responses: {
        create: mock.fn(async () => ({
          output_text: "{ invalid json",
        })),
      },
    } as unknown as OpenAI;

    await assert.rejects(
      () =>
        extractMasterCvCanonicalProfile(mockClient, "gpt-4.1-mini", {
          file: createFileInput(),
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
        responses: {
          create: mock.fn(async () => ({
            output_text: JSON.stringify(invalidOutput),
          })),
        },
      } as unknown as OpenAI;

      await assert.rejects(
        () =>
          extractMasterCvCanonicalProfile(mockClient, "gpt-4.1-mini", {
            file: createFileInput(),
          }),
        /confidence|0|1|finite/i,
      );
    }
  });

  it("rejects unknown fieldStatus keys", async () => {
    const invalidOutput = createValidOutput();
    invalidOutput.extractionCoverage.fieldStatus["not.a.real.field"] = "filled";

    const mockClient = {
      responses: {
        create: mock.fn(async () => ({
          output_text: JSON.stringify(invalidOutput),
        })),
      },
    } as unknown as OpenAI;

    await assert.rejects(
      () =>
        extractMasterCvCanonicalProfile(mockClient, "gpt-4.1-mini", {
          file: createFileInput(),
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
      responses: {
        create: mock.fn(async () => ({
          output_text: JSON.stringify(invalidOutput),
        })),
      },
    } as unknown as OpenAI;

    await assert.rejects(
      () =>
        extractMasterCvCanonicalProfile(mockClient, "gpt-4.1-mini", {
          file: createFileInput(),
        }),
      /evidence|string\[\]/i,
    );
  });
});
