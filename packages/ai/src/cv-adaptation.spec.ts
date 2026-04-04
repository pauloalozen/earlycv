import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";
import type OpenAI from "openai";
import type { CvAdaptationInput, CvAdaptationOutput } from "./cv-adaptation.js";
import { adaptCv } from "./cv-adaptation.js";

describe("adaptCv", () => {
  it("returns a valid CvAdaptationOutput shape when AI responds correctly", async () => {
    const mockOutput: CvAdaptationOutput = {
      summary: "Experienced engineer with strong background in systems design.",
      sections: [
        {
          sectionType: "experience",
          title: "Professional Experience",
          items: [
            {
              heading: "Senior Engineer",
              subheading: "Tech Corp",
              dateRange: "2022-2024",
              bullets: ["Led team of 5 engineers", "Shipped to 10M+ users"],
            },
          ],
        },
      ],
      highlightedSkills: ["TypeScript", "System Design"],
      removedSections: ["Languages"],
      adaptationNotes: "Reordered to emphasize leadership and scale.",
    };

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
            usage: {
              prompt_tokens: 100,
              completion_tokens: 200,
              total_tokens: 300,
            },
          })),
        },
      },
    } as unknown as OpenAI;

    const input: CvAdaptationInput = {
      masterCvText: "Engineer with 5 years experience...",
      jobDescriptionText: "We seek a senior engineer...",
      jobTitle: "Senior Engineer",
      companyName: "Tech Corp",
    };

    const { output, audit } = await adaptCv(mockClient, "gpt-4-mini", input);

    assert.ok(output.summary);
    assert.ok(Array.isArray(output.sections));
    assert.ok(output.sections.length > 0);
    assert.ok(Array.isArray(output.highlightedSkills));
    assert.ok(output.adaptationNotes);
    assert.ok(audit.traceId);
    assert.equal(audit.provider, "openai");
    assert.ok(audit.usage);
    assert.equal(audit.usage.promptTokens, 100);
  });

  it("throws when AI returns malformed JSON", async () => {
    const mockClient = {
      chat: {
        completions: {
          create: mock.fn(async () => ({
            choices: [
              {
                message: {
                  content: "not valid json at all",
                },
              },
            ],
          })),
        },
      },
    } as unknown as OpenAI;

    const input: CvAdaptationInput = {
      masterCvText: "Engineer...",
      jobDescriptionText: "Job...",
    };

    await assert.rejects(
      () => adaptCv(mockClient, "gpt-4-mini", input),
      /JSON|parse/i,
    );
  });

  it("throws when output is missing required fields", async () => {
    const mockClient = {
      chat: {
        completions: {
          create: mock.fn(async () => ({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    summary: "test",
                    // missing sections
                  }),
                },
              },
            ],
          })),
        },
      },
    } as unknown as OpenAI;

    const input: CvAdaptationInput = {
      masterCvText: "Engineer...",
      jobDescriptionText: "Job...",
    };

    await assert.rejects(
      () => adaptCv(mockClient, "gpt-4-mini", input),
      /required|missing|sections/i,
    );
  });
});
