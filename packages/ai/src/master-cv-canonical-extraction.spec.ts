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

describe("extractMasterCvCanonicalProfile", () => {
  it("returns structured canonicalProfile output", async () => {
    const mockOutput = createValidOutput();

    const mockClient = {
      chat: {
        completions: {
          create: mock.fn(async () => ({
            choices: [
              {
                message: {
                  content: JSON.stringify(mockOutput),
                },
              },
            ],
          })),
        },
      },
    } as unknown as OpenAI;

    const input: MasterCvCanonicalExtractionInput = {
      masterCvText: "Ana Silva...",
      locale: "pt-BR",
    };

    const { output } = await extractMasterCvCanonicalProfile(
      mockClient,
      "gpt-4.1-mini",
      input,
    );

    assert.equal(output.canonicalProfile.fullName, "Ana Silva");
    assert.equal(output.extractionCoverage.fieldStatus.fullName, "filled");
    assert.deepEqual(output.canonicalProfile.skills.technical, ["SQL"]);
  });

  it("stores both original and sent input in audit", async () => {
    const mockOutput = createValidOutput();
    const veryLongCv = "x".repeat(30_500);

    const mockClient = {
      chat: {
        completions: {
          create: mock.fn(async () => ({
            choices: [
              {
                message: {
                  content: JSON.stringify(mockOutput),
                },
              },
            ],
          })),
        },
      },
    } as unknown as OpenAI;

    const { audit } = await extractMasterCvCanonicalProfile(
      mockClient,
      "gpt-4.1-mini",
      { masterCvText: veryLongCv, locale: "pt-BR" },
    );

    const requestInput = JSON.parse(audit.request.input) as {
      originalInput: MasterCvCanonicalExtractionInput;
      sentToModel: { locale: string; masterCvText: string };
    };

    assert.equal(requestInput.originalInput.masterCvText.length, 30_500);
    assert.equal(requestInput.sentToModel.locale, "pt-BR");
    assert.equal(requestInput.sentToModel.masterCvText.length, 24_000);
  });

  it("accepts only filled|partial|missing fieldStatus values", async () => {
    const mockClient = {
      chat: {
        completions: {
          create: mock.fn(async () => ({
            choices: [
              {
                message: {
                  content: JSON.stringify({
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
                      fieldStatus: {
                        fullName: "unknown",
                      },
                    },
                    confidence: {},
                    evidence: {},
                  }),
                },
              },
            ],
          })),
        },
      },
    } as unknown as OpenAI;

    await assert.rejects(
      () =>
        extractMasterCvCanonicalProfile(mockClient, "gpt-4.1-mini", {
          masterCvText: "test",
        }),
      /fieldStatus|filled|partial|missing/i,
    );
  });

  it("rejects malformed JSON responses", async () => {
    const mockClient = {
      chat: {
        completions: {
          create: mock.fn(async () => ({
            choices: [
              {
                message: {
                  content: "{ invalid json",
                },
              },
            ],
          })),
        },
      },
    } as unknown as OpenAI;

    await assert.rejects(
      () =>
        extractMasterCvCanonicalProfile(mockClient, "gpt-4.1-mini", {
          masterCvText: "test",
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
            create: mock.fn(async () => ({
              choices: [
                {
                  message: {
                    content: JSON.stringify(invalidOutput),
                  },
                },
              ],
            })),
          },
        },
      } as unknown as OpenAI;

      await assert.rejects(
        () =>
          extractMasterCvCanonicalProfile(mockClient, "gpt-4.1-mini", {
            masterCvText: "test",
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
          create: mock.fn(async () => ({
            choices: [
              {
                message: {
                  content: JSON.stringify(invalidOutput),
                },
              },
            ],
          })),
        },
      },
    } as unknown as OpenAI;

    await assert.rejects(
      () =>
        extractMasterCvCanonicalProfile(mockClient, "gpt-4.1-mini", {
          masterCvText: "test",
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
          create: mock.fn(async () => ({
            choices: [
              {
                message: {
                  content: JSON.stringify(invalidOutput),
                },
              },
            ],
          })),
        },
      },
    } as unknown as OpenAI;

    await assert.rejects(
      () =>
        extractMasterCvCanonicalProfile(mockClient, "gpt-4.1-mini", {
          masterCvText: "test",
        }),
      /evidence|string\[\]/i,
    );
  });
});
