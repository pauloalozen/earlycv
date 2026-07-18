import { randomUUID } from "node:crypto";
import type OpenAI from "openai";

import { extractTextFromPdf } from "./pdf-parser.js";
import { buildSystemMessage, stripJsonCodeFence } from "./prompt-cache.js";
import type { AIProvider } from "./types.js";

const MASTER_CV_MAX_CHARS = 24_000;
const ALLOWED_FIELD_STATUS = ["filled", "partial", "missing"] as const;
const ALLOWED_CANONICAL_FIELD_PATHS = [
  "fullName",
  "headline",
  "email",
  "phone",
  "linkedinUrl",
  "location",
  "location.city",
  "location.state",
  "location.country",
  "professionalSummary",
  "experiences",
  "education",
  "skills",
  "languages",
  "certifications",
] as const;

export type FieldStatus = (typeof ALLOWED_FIELD_STATUS)[number];

type MasterCvFileInput = {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
};

export type MasterCvCanonicalExtractionInput = {
  masterCvText?: string;
  file?: MasterCvFileInput;
  locale?: string;
};

export type CanonicalProfile = {
  fullName: string | null;
  headline: string | null;
  email: string | null;
  phone: string | null;
  linkedinUrl: string | null;
  location: {
    city: string | null;
    state: string | null;
    country: string | null;
  };
  professionalSummary: string | null;
  experiences: Array<{
    role: string | null;
    company: string | null;
    location: string | null;
    startDate: string | null;
    endDate: string | null;
    bullets: string[];
    technologies: string[];
  }>;
  education: Array<{
    institution: string | null;
    degree: string | null;
    fieldOfStudy: string | null;
    startDate: string | null;
    endDate: string | null;
  }>;
  skills: string[];
  languages: Array<{
    language: string;
    level: string | null;
  }>;
  certifications: Array<{
    name: string;
    issuer: string | null;
    year: string | null;
  }>;
};

export type ExtractionCoverage = {
  identifiedFields: string[];
  missingFields: string[];
  fieldStatus: Record<string, FieldStatus>;
};

export type MasterCvCanonicalExtractionOutput = {
  canonicalProfile: CanonicalProfile;
  extractionCoverage: ExtractionCoverage;
  confidence: Record<string, number>;
  evidence: Record<string, string[]>;
};

const SYSTEM_PROMPT = `You are a precise transcription engine for CV data. Your only job is to locate and copy information exactly as written — do NOT rewrite, rephrase, summarize, or infer anything.

HARD RULES:
- TRANSCRIBE VERBATIM: copy text exactly as it appears in the CV. Never paraphrase.
- EXHAUSTIVE: include EVERY experience, education entry, skill, language, and certification present. Do not omit any.
- CONTACT DATA: scan the ENTIRE document — headers, footers, sidebars, top section — for email address, phone number, and LinkedIn URL. These are almost always present. If you see something that looks like an email (contains @), extract it.
- SKILLS must be short keyword chips only (e.g. "React", "Next.js", "SQL", "Agile", "Power BI"). Never output phrases or sentences as skills. Split compound skill lists into individual items.
- Never invent or infer data not explicitly present in the CV text.
- Missing/unknown values must be null or empty arrays.
- Return strict JSON only.
- extractionCoverage.fieldStatus values must be only: filled, partial, missing.

Return exactly this JSON shape:
{
  "canonicalProfile": {
    "fullName": string | null,
    "headline": string | null,
    "email": string | null,
    "phone": string | null,
    "linkedinUrl": string | null,
    "location": { "city": string | null, "state": string | null, "country": string | null },
    "professionalSummary": string | null,
    "experiences": [{ "role": string | null, "company": string | null, "location": string | null, "startDate": string | null, "endDate": string | null, "bullets": string[], "technologies": string[] }],
    "education": [{ "institution": string | null, "degree": string | null, "fieldOfStudy": string | null, "startDate": string | null, "endDate": string | null }],
    "skills": string[],
    "languages": [{ "language": string, "level": string | null }],
    "certifications": [{ "name": string, "issuer": string | null, "year": string | null }]
  },
  "extractionCoverage": {
    "identifiedFields": string[],
    "missingFields": string[],
    "fieldStatus": { "<field>": "filled" | "partial" | "missing" }
  },
  "confidence": { "<field>": number },
  "evidence": { "<field>": string[] }
}`;

function createAuditRecord(params: {
  traceId: string;
  provider: AIProvider;
  model: string;
  request: {
    originalInput: {
      locale: string;
      masterCvText: string | null;
      file: {
        originalname: string;
        mimetype: string;
        size: number;
      } | null;
    };
    sentToModel: {
      locale: string;
      prompt: string;
      masterCvText: string;
    };
  };
  result: {
    content: string;
    usage?: {
      promptTokens?: number;
      completionTokens?: number;
      totalTokens?: number;
    };
  };
}) {
  return {
    traceId: params.traceId,
    createdAt: new Date(),
    provider: params.provider,
    request: {
      provider: params.provider,
      model: params.model,
      input: JSON.stringify(params.request),
      systemPrompt: SYSTEM_PROMPT,
    },
    result: {
      provider: params.provider,
      model: params.model,
      content: params.result.content,
      usage: params.result.usage,
    },
  };
}

// A Chat Completions API (usada por todos os supliers hoje: OpenAI, xAI,
// Anthropic, Gemini, Kimi, GLM, DeepSeek) não tem um equivalente universal ao
// upload nativo de PDF da Responses API da OpenAI (input_file/file_data) — nem
// todo provedor aceita o mesmo formato de arquivo. Por isso o texto do CV é
// sempre extraído localmente (via pdf-parse) antes de ir para o modelo; isso
// também é mais barato e determinístico do que depender de OCR/visão nativa
// de cada provedor.
async function resolveMasterCvText(
  input: MasterCvCanonicalExtractionInput,
): Promise<string> {
  if (input.masterCvText) {
    return input.masterCvText.slice(0, MASTER_CV_MAX_CHARS);
  }

  if (input.file) {
    const text = await extractTextFromPdf(input.file.buffer);
    return text.slice(0, MASTER_CV_MAX_CHARS);
  }

  return "";
}

function buildPrompt(locale: string, masterCvText: string): string {
  return `<LOCALE>${locale}</LOCALE>\n<MASTER_CV>\n${masterCvText}\n</MASTER_CV>\n<TASK>Extract canonical profile data and return as JSON.</TASK>`;
}

function validateString(value: unknown, path: string): string {
  if (typeof value !== "string") throw new Error(`Invalid string at ${path}`);
  return value;
}

function validateNullableString(value: unknown, path: string): string | null {
  if (value === null) return null;
  return validateString(value, path);
}

function validateStringArray(value: unknown, path: string): string[] {
  if (!Array.isArray(value)) throw new Error(`Invalid string[] at ${path}`);
  return value.map((item, index) => validateString(item, `${path}[${index}]`));
}

function validateRecord(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Invalid object at ${path}`);
  }
  return value as Record<string, unknown>;
}

function validateOutput(payload: unknown): MasterCvCanonicalExtractionOutput {
  const root = validateRecord(payload, "output");
  const canonicalProfile = validateRecord(
    root.canonicalProfile,
    "canonicalProfile",
  );
  const coverage = validateRecord(
    root.extractionCoverage,
    "extractionCoverage",
  );
  const confidence = validateRecord(root.confidence, "confidence");
  const evidence = validateRecord(root.evidence, "evidence");

  const location = validateRecord(
    canonicalProfile.location,
    "canonicalProfile.location",
  );

  // extractionCoverage is also supplementary audit data (which fields the
  // model thinks it found), not canonical profile content — same leniency
  // rationale as confidence/evidence below. Already seen in prod: the model
  // emitting a fieldStatus key using the full JSON path
  // ("canonicalProfile.fullName") instead of the relative one ("fullName")
  // took down the entire extraction.
  const typedCoverage = {
    identifiedFields: Array.isArray(coverage.identifiedFields)
      ? coverage.identifiedFields.filter(
          (item): item is string => typeof item === "string",
        )
      : [],
    missingFields: Array.isArray(coverage.missingFields)
      ? coverage.missingFields.filter(
          (item): item is string => typeof item === "string",
        )
      : [],
    fieldStatus: (() => {
      if (
        !coverage.fieldStatus ||
        typeof coverage.fieldStatus !== "object" ||
        Array.isArray(coverage.fieldStatus)
      ) {
        return {} as Record<string, FieldStatus>;
      }
      const fieldStatus = coverage.fieldStatus as Record<string, unknown>;
      const sanitized: Record<string, FieldStatus> = {};
      for (const [key, value] of Object.entries(fieldStatus)) {
        if (
          !ALLOWED_CANONICAL_FIELD_PATHS.includes(
            key as (typeof ALLOWED_CANONICAL_FIELD_PATHS)[number],
          )
        ) {
          continue;
        }
        if (
          typeof value === "string" &&
          ALLOWED_FIELD_STATUS.includes(value as FieldStatus)
        ) {
          sanitized[key] = value as FieldStatus;
        }
      }
      return sanitized;
    })(),
  };

  // confidence/evidence are supplementary audit data (confidence scores and
  // verbatim citations backing them), not canonical profile content. A
  // single malformed or unexpected entry from the model shouldn't fail the
  // whole extraction — drop just that entry instead of rejecting the
  // payload. canonicalProfile below stays strict since that IS the data we
  // persist into the user's profile.
  const sanitizedConfidence: Record<string, number> = {};
  for (const [key, value] of Object.entries(confidence)) {
    if (
      !ALLOWED_CANONICAL_FIELD_PATHS.includes(
        key as (typeof ALLOWED_CANONICAL_FIELD_PATHS)[number],
      )
    ) {
      continue;
    }
    if (
      typeof value === "number" &&
      Number.isFinite(value) &&
      value >= 0 &&
      value <= 1
    ) {
      sanitizedConfidence[key] = value;
    }
  }

  const sanitizedEvidence: Record<string, string[]> = {};
  for (const [key, value] of Object.entries(evidence)) {
    if (
      !ALLOWED_CANONICAL_FIELD_PATHS.includes(
        key as (typeof ALLOWED_CANONICAL_FIELD_PATHS)[number],
      ) ||
      !Array.isArray(value)
    ) {
      continue;
    }
    sanitizedEvidence[key] = value.filter(
      (item): item is string => typeof item === "string",
    );
  }

  return {
    canonicalProfile: {
      fullName: validateNullableString(
        canonicalProfile.fullName,
        "canonicalProfile.fullName",
      ),
      headline: validateNullableString(
        canonicalProfile.headline,
        "canonicalProfile.headline",
      ),
      email: validateNullableString(
        canonicalProfile.email,
        "canonicalProfile.email",
      ),
      phone: validateNullableString(
        canonicalProfile.phone,
        "canonicalProfile.phone",
      ),
      linkedinUrl: validateNullableString(
        canonicalProfile.linkedinUrl,
        "canonicalProfile.linkedinUrl",
      ),
      location: {
        city: validateNullableString(
          location.city,
          "canonicalProfile.location.city",
        ),
        state: validateNullableString(
          location.state,
          "canonicalProfile.location.state",
        ),
        country: validateNullableString(
          location.country,
          "canonicalProfile.location.country",
        ),
      },
      professionalSummary: validateNullableString(
        canonicalProfile.professionalSummary,
        "canonicalProfile.professionalSummary",
      ),
      experiences: (() => {
        if (!Array.isArray(canonicalProfile.experiences)) {
          throw new Error(
            "Invalid experiences array at canonicalProfile.experiences",
          );
        }
        return canonicalProfile.experiences.map((raw, index) => {
          const entry = validateRecord(
            raw,
            `canonicalProfile.experiences[${index}]`,
          );
          return {
            role: validateNullableString(
              entry.role,
              `canonicalProfile.experiences[${index}].role`,
            ),
            company: validateNullableString(
              entry.company,
              `canonicalProfile.experiences[${index}].company`,
            ),
            location: validateNullableString(
              entry.location,
              `canonicalProfile.experiences[${index}].location`,
            ),
            startDate: validateNullableString(
              entry.startDate,
              `canonicalProfile.experiences[${index}].startDate`,
            ),
            endDate: validateNullableString(
              entry.endDate,
              `canonicalProfile.experiences[${index}].endDate`,
            ),
            bullets: validateStringArray(
              entry.bullets,
              `canonicalProfile.experiences[${index}].bullets`,
            ),
            technologies: validateStringArray(
              entry.technologies,
              `canonicalProfile.experiences[${index}].technologies`,
            ),
          };
        });
      })(),
      education: (() => {
        if (!Array.isArray(canonicalProfile.education)) {
          throw new Error(
            "Invalid education array at canonicalProfile.education",
          );
        }
        return canonicalProfile.education.map((raw, index) => {
          const entry = validateRecord(
            raw,
            `canonicalProfile.education[${index}]`,
          );
          return {
            institution: validateNullableString(
              entry.institution,
              `canonicalProfile.education[${index}].institution`,
            ),
            degree: validateNullableString(
              entry.degree,
              `canonicalProfile.education[${index}].degree`,
            ),
            fieldOfStudy: validateNullableString(
              entry.fieldOfStudy,
              `canonicalProfile.education[${index}].fieldOfStudy`,
            ),
            startDate: validateNullableString(
              entry.startDate,
              `canonicalProfile.education[${index}].startDate`,
            ),
            endDate: validateNullableString(
              entry.endDate,
              `canonicalProfile.education[${index}].endDate`,
            ),
          };
        });
      })(),
      skills: validateStringArray(
        canonicalProfile.skills,
        "canonicalProfile.skills",
      ),
      languages: (() => {
        if (!Array.isArray(canonicalProfile.languages)) {
          throw new Error(
            "Invalid languages array at canonicalProfile.languages",
          );
        }
        return canonicalProfile.languages.map((raw, index) => {
          const entry = validateRecord(
            raw,
            `canonicalProfile.languages[${index}]`,
          );
          return {
            language: validateString(
              entry.language,
              `canonicalProfile.languages[${index}].language`,
            ),
            level: validateNullableString(
              entry.level,
              `canonicalProfile.languages[${index}].level`,
            ),
          };
        });
      })(),
      certifications: (() => {
        if (!Array.isArray(canonicalProfile.certifications)) {
          throw new Error(
            "Invalid certifications array at canonicalProfile.certifications",
          );
        }
        return canonicalProfile.certifications.map((raw, index) => {
          const entry = validateRecord(
            raw,
            `canonicalProfile.certifications[${index}]`,
          );
          return {
            name: validateString(
              entry.name,
              `canonicalProfile.certifications[${index}].name`,
            ),
            issuer: validateNullableString(
              entry.issuer,
              `canonicalProfile.certifications[${index}].issuer`,
            ),
            year: validateNullableString(
              entry.year,
              `canonicalProfile.certifications[${index}].year`,
            ),
          };
        });
      })(),
    },
    extractionCoverage: typedCoverage,
    confidence: sanitizedConfidence,
    evidence: sanitizedEvidence,
  };
}

export async function extractMasterCvCanonicalProfile(
  client: OpenAI,
  model: string,
  input: MasterCvCanonicalExtractionInput,
  provider: AIProvider = "openai",
): Promise<{
  output: MasterCvCanonicalExtractionOutput;
  audit: ReturnType<typeof createAuditRecord>;
}> {
  const traceId = randomUUID();
  const locale = input.locale ?? "pt-BR";
  const masterCvText = await resolveMasterCvText(input);
  const prompt = buildPrompt(locale, masterCvText);

  const response = await client.chat.completions.create({
    model,
    messages: [
      buildSystemMessage(model, SYSTEM_PROMPT),
      { role: "user", content: prompt },
    ],
    response_format: { type: "json_object" },
  });

  const content = response.choices[0]?.message.content;
  if (!content) throw new Error("No response content from AI model");

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripJsonCodeFence(content));
  } catch {
    throw new Error(
      `Failed to parse AI response as JSON: ${content.slice(0, 200)}`,
    );
  }

  const output = validateOutput(parsed);

  const audit = createAuditRecord({
    traceId,
    provider,
    model,
    request: {
      originalInput: {
        locale,
        masterCvText: input.masterCvText ?? null,
        file: input.file
          ? {
              originalname: input.file.originalname,
              mimetype: input.file.mimetype,
              size: input.file.size,
            }
          : null,
      },
      sentToModel: {
        locale,
        prompt,
        masterCvText,
      },
    },
    result: {
      content: JSON.stringify(output),
      usage: {
        promptTokens: response.usage?.prompt_tokens,
        completionTokens: response.usage?.completion_tokens,
        totalTokens: response.usage?.total_tokens,
      },
    },
  });

  return { output, audit };
}
