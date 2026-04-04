import { randomUUID } from "node:crypto";
import type OpenAI from "openai";

export type CvAdaptationInput = {
  masterCvText: string;
  jobDescriptionText: string;
  jobTitle?: string;
  companyName?: string;
  templateHints?: string;
};

export type CvSectionItem = {
  heading: string;
  subheading?: string;
  dateRange?: string;
  bullets: string[];
};

export type CvSection = {
  sectionType:
    | "experience"
    | "education"
    | "skills"
    | "projects"
    | "certifications"
    | "languages"
    | "other";
  title: string;
  items: CvSectionItem[];
};

export type CvAdaptationOutput = {
  summary: string;
  sections: CvSection[];
  highlightedSkills: string[];
  removedSections: string[];
  adaptationNotes: string;
};

const SYSTEM_PROMPT = `You are an expert CV adaptation assistant. Your role is to help users tailor their CVs for specific job openings.

CRITICAL RULE: You must NEVER fabricate or invent any career facts. You can only reorganize, rephrase, and remove content from the provided CV. Never add:
- Experiences not in the original CV
- Skills or technologies not mentioned in the CV
- Certifications not held by the candidate
- Accomplishments or achievements not listed
- Titles, roles, or companies not previously held

Your task is to:
1. Analyze the original CV text carefully
2. Read the job description to understand requirements
3. Reorganize and rephrase the CV content to better match the job
4. Remove irrelevant sections to reduce noise
5. Highlight the most relevant skills
6. Explain what was changed and why

Return ONLY a valid JSON object matching this schema (no markdown, no code blocks):
{
  "summary": "Professional summary adapted to the job (200 chars max)",
  "sections": [
    {
      "sectionType": "experience|education|skills|projects|certifications|languages|other",
      "title": "Section Title",
      "items": [
        {
          "heading": "Role or Title",
          "subheading": "Company or School (optional)",
          "dateRange": "2022-2024 (optional)",
          "bullets": ["Accomplishment 1", "Accomplishment 2"]
        }
      ]
    }
  ],
  "highlightedSkills": ["Skill 1", "Skill 2", "Skill 3"],
  "removedSections": ["Section name if any were removed"],
  "adaptationNotes": "Brief explanation of what was changed and why (100 chars max)"
}

Requirements:
- All skills in highlightedSkills must exist in the original CV
- All experience bullets must be copied or rephrased from the original CV
- If a section was completely removed, list its name in removedSections
- adaptationNotes should explain strategic choices, not fabrications`;

export async function adaptCv(
  client: OpenAI,
  model: string,
  input: CvAdaptationInput,
): Promise<{
  output: CvAdaptationOutput;
  audit: ReturnType<typeof createAuditRecord>;
}> {
  const traceId = randomUUID();

  const userMessage = `
Original CV:
${input.masterCvText}

---

Job Description:
${input.jobDescriptionText}
${input.jobTitle ? `\nJob Title: ${input.jobTitle}` : ""}
${input.companyName ? `Company: ${input.companyName}` : ""}
${input.templateHints ? `\nFormatting Hints: ${input.templateHints}` : ""}

Please adapt the CV to better match this job opening, following all rules about never fabricating information.
`;

  try {
    const response = await client.chat.completions.create({
      model,
      messages: [
        {
          role: "system",
          content: SYSTEM_PROMPT,
        },
        {
          role: "user",
          content: userMessage,
        },
      ],
      temperature: 0.7,
    });

    const content = response.choices[0]?.message.content;
    if (!content) {
      throw new Error("No response content from AI model");
    }

    let output: CvAdaptationOutput;
    try {
      output = JSON.parse(content);
    } catch {
      throw new Error(
        `Failed to parse AI response as JSON: ${content.slice(0, 200)}`,
      );
    }

    validateCvAdaptationOutput(output);

    const audit = createAuditRecord({
      traceId,
      provider: "openai",
      model,
      request: {
        input,
        model,
        provider: "openai",
        systemPrompt: SYSTEM_PROMPT,
      },
      result: {
        content: JSON.stringify(output),
        model,
        provider: "openai",
        usage: {
          promptTokens: response.usage?.prompt_tokens,
          completionTokens: response.usage?.completion_tokens,
          totalTokens: response.usage?.total_tokens,
        },
      },
    });

    return { output, audit };
  } catch (error) {
    throw error instanceof Error
      ? error
      : new Error(`Unknown error in adaptCv: ${String(error)}`);
  }
}

function validateCvAdaptationOutput(
  output: unknown,
): asserts output is CvAdaptationOutput {
  if (!output || typeof output !== "object") {
    throw new Error("Output is not an object");
  }

  const obj = output as Record<string, unknown>;

  if (typeof obj.summary !== "string" || !obj.summary) {
    throw new Error("Missing or invalid required field: summary");
  }

  if (!Array.isArray(obj.sections)) {
    throw new Error("Missing or invalid required field: sections");
  }

  if (obj.sections.length === 0) {
    throw new Error("Sections array must not be empty");
  }

  for (const section of obj.sections) {
    if (typeof section !== "object" || !section) {
      throw new Error("Invalid section in sections array");
    }
    const sec = section as Record<string, unknown>;
    if (typeof sec.sectionType !== "string" || !sec.sectionType) {
      throw new Error("Section missing sectionType");
    }
    if (typeof sec.title !== "string" || !sec.title) {
      throw new Error("Section missing title");
    }
    if (!Array.isArray(sec.items)) {
      throw new Error("Section missing items array");
    }
  }

  if (!Array.isArray(obj.highlightedSkills)) {
    throw new Error("Missing or invalid required field: highlightedSkills");
  }

  if (!Array.isArray(obj.removedSections)) {
    throw new Error("Missing or invalid required field: removedSections");
  }

  if (typeof obj.adaptationNotes !== "string") {
    throw new Error("Missing or invalid required field: adaptationNotes");
  }
}

function createAuditRecord(data: {
  traceId: string;
  provider: "openai";
  model: string;
  request: {
    input: CvAdaptationInput;
    model: string;
    provider: "openai";
    systemPrompt: string;
  };
  result: {
    content: string;
    model: string;
    provider: "openai";
    usage?: {
      promptTokens?: number;
      completionTokens?: number;
      totalTokens?: number;
    };
  };
}) {
  return {
    traceId: data.traceId,
    createdAt: new Date(),
    provider: data.provider,
    model: data.model,
    request: data.request,
    result: data.result,
    usage: data.result.usage,
  };
}
