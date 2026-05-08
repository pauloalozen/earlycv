import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";
import type { CvAdaptationOutput } from "@earlycv/ai";
import type { CvAdaptation } from "@prisma/client";
import type OpenAI from "openai";
import type { DatabaseService } from "../database/database.service";
import { CvAdaptationAiService } from "./cv-adaptation-ai.service";

const withEnv = async (
  values: Record<string, string | undefined>,
  run: () => Promise<void>,
) => {
  const previous = new Map<string, string | undefined>();

  for (const [key, value] of Object.entries(values)) {
    previous.set(key, process.env[key]);

    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  try {
    await run();
  } finally {
    for (const [key, value] of previous.entries()) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
};

describe("CvAdaptationAiService", () => {
  it("calls adaptCv and updates adaptation to awaiting_payment on success", async () => {
    await withEnv({ SKIP_AI: "true" }, async () => {
      const mockOutput: CvAdaptationOutput = {
        summary: "Senior Engineer with expertise in system design.",
        sections: [
          {
            sectionType: "experience",
            title: "Experience",
            items: [
              {
                heading: "Senior Engineer",
                subheading: "Tech Corp",
                dateRange: "2022-2024",
                bullets: ["Led 5 engineers", "10M+ users"],
              },
            ],
          },
        ],
        highlightedSkills: ["TypeScript", "System Design"],
        removedSections: ["Languages"],
        adaptationNotes: "Reordered to emphasize leadership.",
      };

      const mockAiClient = {
        chat: {
          completions: {
            create: mock.fn(async () => ({
              choices: [{ message: { content: JSON.stringify(mockOutput) } }],
              usage: {
                prompt_tokens: 100,
                completion_tokens: 200,
                total_tokens: 300,
              },
            })),
          },
        },
      } as unknown as OpenAI;

      const mockDatabase = {
        cvAdaptation: {
          update: mock.fn(async (args: unknown) => args),
        },
      } as unknown as DatabaseService;

      const service = new CvAdaptationAiService(mockDatabase, mockAiClient);

      const adaptation: CvAdaptation = {
        id: "test-id",
        userId: "user-id",
        masterResumeId: "resume-id",
        templateId: null,
        jobDescriptionText: "Senior Engineer role",
        jobTitle: "Senior Engineer",
        companyName: "Tech Corp",
        status: "analyzing",
        adaptedContentJson: null,
        previewText: null,
        adaptedResumeId: null,
        aiAuditJson: null,
        paymentStatus: "none",
        paymentProvider: null,
        paymentReference: null,
        paymentAmountInCents: null,
        paymentCurrency: null,
        paidAt: null,
        failureReason: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await service.analyzeAndAdapt(
        adaptation,
        "Engineer with 5 years experience",
      );

      // Verify update was called with correct status
      const updateFn = mockDatabase.cvAdaptation.update as ReturnType<
        typeof mock.fn
      >;
      const updateCall = updateFn.mock.calls[0];
      assert.ok(updateCall);
      const updateData = updateCall.arguments[0].data;
      assert.equal(updateData.status, "awaiting_payment");
      assert.ok(updateData.adaptedContentJson);
      assert.equal(typeof updateData.previewText, "string");
      assert.equal(updateData.aiAuditJson, undefined);
    });
  });

  it("updates adaptation to failed when AI throws", async () => {
    await withEnv({ SKIP_AI: "false" }, async () => {
      const mockAiClient = {
        chat: {
          completions: {
            create: mock.fn(async () => {
              throw new Error("OpenAI API error");
            }),
          },
        },
      } as unknown as OpenAI;

      const mockDatabase = {
        cvAdaptation: {
          update: mock.fn(async (args: unknown) => args),
        },
      } as unknown as DatabaseService;

      const service = new CvAdaptationAiService(mockDatabase, mockAiClient);

      const adaptation: CvAdaptation = {
        id: "test-id",
        userId: "user-id",
        masterResumeId: "resume-id",
        templateId: null,
        jobDescriptionText: "Job",
        jobTitle: null,
        companyName: null,
        status: "analyzing",
        adaptedContentJson: null,
        previewText: null,
        adaptedResumeId: null,
        aiAuditJson: null,
        paymentStatus: "none",
        paymentProvider: null,
        paymentReference: null,
        paymentAmountInCents: null,
        paymentCurrency: null,
        paidAt: null,
        failureReason: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await service.analyzeAndAdapt(adaptation, "Resume text");

      const updateFn = mockDatabase.cvAdaptation.update as ReturnType<
        typeof mock.fn
      >;
      const updateCall = updateFn.mock.calls[0];
      assert.ok(updateCall);
      const updateData = updateCall.arguments[0].data;
      assert.equal(updateData.status, "failed");
      assert.ok(updateData.failureReason);
    });
  });
});
