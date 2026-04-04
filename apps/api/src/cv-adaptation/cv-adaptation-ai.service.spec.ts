import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";
import type { CvAdaptationOutput } from "@earlycv/ai";
import type { ConfigService } from "@nestjs/config";
import type OpenAI from "openai";
import type { DatabaseService } from "../database/database.service";
import { CvAdaptationAiService } from "./cv-adaptation-ai.service";

describe("CvAdaptationAiService", () => {
  it("calls adaptCv and updates adaptation to awaiting_payment on success", async () => {
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

    const mockConfig = {
      get: mock.fn((key: string) => {
        if (key === "OPENAI_MODEL") return "gpt-4-mini";
        return undefined;
      }),
    } as unknown as ConfigService;

    const service = new CvAdaptationAiService(
      mockDatabase,
      mockAiClient,
      mockConfig,
    );

    const adaptation = {
      id: "test-id",
      status: "analyzing" as const,
      jobDescriptionText: "Senior Engineer role",
      jobTitle: "Senior Engineer",
      companyName: "Tech Corp",
    };

    await service.analyzeAndAdapt(
      adaptation as any,
      "Engineer with 5 years experience",
    );

    // Verify update was called with correct status
    const updateCall = (mockDatabase.cvAdaptation.update as any).mock.calls[0];
    assert.ok(updateCall);
    const updateData = updateCall[0].data;
    assert.equal(updateData.status, "awaiting_payment");
    assert.ok(updateData.adaptedContentJson);
    assert.equal(typeof updateData.previewText, "string");
    assert.ok(updateData.aiAuditJson);
  });

  it("updates adaptation to failed when AI throws", async () => {
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

    const mockConfig = {
      get: mock.fn((key: string) => {
        if (key === "OPENAI_MODEL") return "gpt-4-mini";
        return undefined;
      }),
    } as unknown as ConfigService;

    const service = new CvAdaptationAiService(
      mockDatabase,
      mockAiClient,
      mockConfig,
    );

    const adaptation = {
      id: "test-id",
      status: "analyzing" as const,
      jobDescriptionText: "Job",
    };

    await service.analyzeAndAdapt(adaptation as any, "Resume text");

    const updateCall = (mockDatabase.cvAdaptation.update as any).mock.calls[0];
    assert.ok(updateCall);
    const updateData = updateCall[0].data;
    assert.equal(updateData.status, "failed");
    assert.ok(updateData.failureReason);
  });
});
