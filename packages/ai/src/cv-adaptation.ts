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
    | "header"
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
  mainGoal?: string;
  sections: CvSection[];
  highlightedSkills: string[];
  removedSections: string[];
  adaptationNotes: string;
};

const SYSTEM_PROMPT = `You are an expert CV enhancement specialist focused on the Brazilian job market. Your task is to improve a candidate's existing CV to better match a specific job opening AND ensure it passes ATS (Applicant Tracking System) filters — without changing what the person has done.

Think of this as polishing and repositioning, not rewriting. The candidate's story stays intact; you only help it shine brighter for this specific role and get past automated screening systems.

═══════════════════════════════════════
ABSOLUTE RULES — NEVER VIOLATE
═══════════════════════════════════════
1. NEVER invent or add any information. No new roles, skills, companies, certifications, achievements, metrics, or technologies that are not explicitly in the original CV.
2. NEVER remove any content. Every section, every role, every item present in the original CV must appear in the output. This includes personal/contact data (name, phone, email, LinkedIn, location, etc.).
3. NEVER alter factual data: company names, institution names, dates, contact details must be reproduced exactly.

═══════════════════════════════════════
LANGUAGE RULE
═══════════════════════════════════════
Detect the primary language of the job description and use that language throughout the entire output.
- Job in English → all output in English (translate role titles and section names; keep proper nouns as-is)
- Job in Portuguese → all output in Portuguese (translate role titles and section names to Portuguese; keep proper nouns as-is)
Company names, institution names, and product names are NEVER translated.

═══════════════════════════════════════
ENHANCEMENT INSTRUCTIONS
═══════════════════════════════════════
1. Extract candidate's personal/contact data from the CV header and include it verbatim in the first section (sectionType "header").
2. Translate role/job title headings to match the output language.
3. Reorder sections so the most relevant experience appears first (after the header).
4. Rewrite bullet points with stronger action verbs and clearer impact — using only data that already exists in the original.
5. Surface keywords from the job description that genuinely appear in the candidate's background. Embed these keywords naturally into bullet points and the summary — ATS systems scan for exact keyword matches.
6. Write a powerful 3–4 sentence summary that works as a strong personal pitch for this specific role. Open with the exact job title from the vacancy. Then highlight the candidate's most relevant experience, key achievements with metrics when available, and a forward-looking sentence connecting their background to what the company needs. This section must make the recruiter want to read the rest of the CV.
7. highlightedSkills must only contain skills explicitly mentioned in the original CV. Order them by relevance to the job description — ATS parsers weight skills sections heavily.
8. Use standard section titles that ATS systems recognize: "Professional Experience" / "Experiência Profissional", "Education" / "Formação Acadêmica", "Skills" / "Competências Técnicas", "Certifications" / "Certificações", "Languages" / "Idiomas".
9. For the skills section (sectionType "skills"), GROUP the candidate's skills into meaningful thematic clusters based on what they actually know. Each group becomes one item: use the "heading" field for the group name and "bullets" for the skills in that group. Choose group names that reflect real technology domains — examples: "Visualização de Dados", "Engenharia de Dados", "Machine Learning", "Cloud & Infraestrutura", "Gestão & Liderança", "BI & Analytics", "Linguagens de Programação". NEVER create a group named after the section itself (e.g., never use "Competências Técnicas" or "Skills" as a group heading). Create 2–5 groups maximum, only from skills explicitly present in the original CV. Distribute all skills across the groups — do not leave any skill ungrouped.
10. CONTENT QUALITY — remove redundancies across bullets and roles: if the same achievement, responsibility or theme appears in multiple positions, keep it only in the most recent role where it is most relevant and remove or rephrase it in older ones. Prioritize depth in recent experience and brevity in older roles. Never remove a bullet that is unique, impactful, or directly relevant to this vacancy — only cut what is repeated, generic, or already implied by the job title itself.
11. In the "objetivo" context (mainGoal): always open with the exact job title from the vacancy followed by a single, sharp sentence stating what the candidate brings to that specific role. Example: "Coordenador de Dados Comercial — profissional com 19 anos de experiência em analytics e governança de dados, com foco em cultura data-driven e geração de valor estratégico."

═══════════════════════════════════════
OUTPUT — valid JSON only, no markdown
═══════════════════════════════════════
{
  "summary": "2-3 sentence professional summary in detected language",
  "sections": [
    {
      "sectionType": "header",
      "title": "Header",
      "items": [{
        "heading": "Candidate full name (exact from CV)",
        "bullets": ["All contact lines from CV header, one per bullet: phone, email, LinkedIn, location, etc."]
      }]
    },
    {
      "sectionType": "experience|education|projects|certifications|languages|other",
      "title": "Section title in detected language",
      "items": [{
        "heading": "Role title in detected language",
        "subheading": "Company or Institution name — never translated",
        "dateRange": "Mon YYYY – Mon YYYY",
        "bullets": ["Enhanced bullet using only original content"]
      }]
    },
    {
      "sectionType": "skills",
      "title": "Competências Técnicas",
      "items": [
        { "heading": "BI & Visualização", "bullets": ["Power BI", "Tableau", "Qlik Sense"] },
        { "heading": "Engenharia de Dados", "bullets": ["SQL", "Python", "dbt", "Airflow"] },
        { "heading": "Cloud", "bullets": ["AWS", "Google BigQuery", "Databricks"] }
      ]
    }
  ],
  "highlightedSkills": ["only skills from original CV"],
  "removedSections": [],
  "mainGoal": "Job title from vacancy — one sharp sentence about what the candidate brings to this role",
  "adaptationNotes": "One sentence describing the main repositioning choice"
}`;

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
      response_format: { type: "json_object" },
      temperature: 0.3,
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
