import { randomUUID } from "node:crypto";
import type OpenAI from "openai";

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
      masterCvText: string | null;
      file: {
        filename: string;
        mimetype: string;
        size: number;
        fileDataLength: number;
      } | null;
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
    provider: "openai" as const,
    request: {
      provider: "openai" as const,
      model: params.model,
      input: JSON.stringify(params.request),
      systemPrompt: SYSTEM_PROMPT,
    },
    result: {
      provider: "openai" as const,
      model: params.model,
      content: params.result.content,
      usage: params.result.usage,
    },
  };
}

function buildPrompt(input: MasterCvCanonicalExtractionInput) {
  const locale = input.locale ?? "pt-BR";
  const masterCvText = input.masterCvText
    ? input.masterCvText.slice(0, MASTER_CV_MAX_CHARS)
    : null;

  const prompt = input.file
    ? [
        `<LOCALE>${locale}</LOCALE>`,
        `<TASK>Extract canonical profile data from the attached CV file and return as JSON.</TASK>`,
        `<FILE_METADATA>`,
        `name: ${input.file.originalname}`,
        `mimeType: ${input.file.mimetype}`,
        `sizeBytes: ${input.file.size}`,
        `</FILE_METADATA>`,
      ].join("\n")
    : `<LOCALE>${locale}</LOCALE>\n<MASTER_CV>\n${masterCvText ?? ""}\n</MASTER_CV>\n<TASK>Extract canonical profile data and return as JSON.</TASK>`;

  return { locale, masterCvText, prompt };
}

function buildResponseInput(
  input: MasterCvCanonicalExtractionInput,
  prompt: string,
) {
  if (input.file) {
    // file_data must be a data URI: data:<mime>;base64,<data>
    const base64 = input.file.buffer.toString("base64");
    const dataUri = `data:${input.file.mimetype};base64,${base64}`;
    return [
      {
        role: "user" as const,
        content: [
          {
            type: "input_file" as const,
            file_data: dataUri,
            filename: input.file.originalname,
          },
          {
            type: "input_text" as const,
            text: prompt,
          },
        ],
      },
    ];
  }

  return [
    {
      role: "user" as const,
      content: [
        {
          type: "input_text" as const,
          text: prompt,
        },
      ],
    },
  ];
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

  const typedCoverage = {
    identifiedFields: validateStringArray(
      coverage.identifiedFields,
      "extractionCoverage.identifiedFields",
    ),
    missingFields: validateStringArray(
      coverage.missingFields,
      "extractionCoverage.missingFields",
    ),
    fieldStatus: (() => {
      const fieldStatus = validateRecord(
        coverage.fieldStatus,
        "extractionCoverage.fieldStatus",
      );
      for (const [key, value] of Object.entries(fieldStatus)) {
        if (
          !ALLOWED_CANONICAL_FIELD_PATHS.includes(
            key as (typeof ALLOWED_CANONICAL_FIELD_PATHS)[number],
          )
        ) {
          throw new Error(
            `Unknown fieldStatus key at extractionCoverage.fieldStatus.${key}`,
          );
        }
        if (
          typeof value !== "string" ||
          !ALLOWED_FIELD_STATUS.includes(value as FieldStatus)
        ) {
          throw new Error(
            `Invalid fieldStatus value at extractionCoverage.fieldStatus.${key}. Allowed: filled|partial|missing`,
          );
        }
      }
      return fieldStatus as Record<string, FieldStatus>;
    })(),
  };

  for (const [key, value] of Object.entries(confidence)) {
    if (
      !ALLOWED_CANONICAL_FIELD_PATHS.includes(
        key as (typeof ALLOWED_CANONICAL_FIELD_PATHS)[number],
      )
    ) {
      throw new Error(`Unknown confidence key at confidence.${key}`);
    }
    if (
      typeof value !== "number" ||
      !Number.isFinite(value) ||
      value < 0 ||
      value > 1
    ) {
      throw new Error(
        `Invalid confidence value at confidence.${key}. Expected finite number in [0,1]`,
      );
    }
  }

  for (const [key, value] of Object.entries(evidence)) {
    if (
      !ALLOWED_CANONICAL_FIELD_PATHS.includes(
        key as (typeof ALLOWED_CANONICAL_FIELD_PATHS)[number],
      )
    ) {
      throw new Error(`Unknown evidence key at evidence.${key}`);
    }
    validateStringArray(value, `evidence.${key}`);
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
    confidence: confidence as Record<string, number>,
    evidence: evidence as Record<string, string[]>,
  };
}

export async function extractMasterCvCanonicalProfile(
  client: OpenAI,
  model: string,
  input: MasterCvCanonicalExtractionInput,
): Promise<{
  output: MasterCvCanonicalExtractionOutput;
  audit: ReturnType<typeof createAuditRecord>;
}> {
  const traceId = randomUUID();
  const { locale, masterCvText, prompt } = buildPrompt(input);
  const response = await client.responses.create({
    model,
    instructions: SYSTEM_PROMPT,
    input: buildResponseInput(input, prompt),
    text: { format: { type: "json_object" } },
  });

  const content = response.output_text;
  if (!content) throw new Error("No response content from AI model");

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error(
      `Failed to parse AI response as JSON: ${content.slice(0, 200)}`,
    );
  }

  const output = validateOutput(parsed);

  const audit = createAuditRecord({
    traceId,
    model,
    request: {
      originalInput: {
        locale,
        masterCvText,
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
        file: input.file
          ? {
              filename: input.file.originalname,
              mimetype: input.file.mimetype,
              size: input.file.size,
              fileDataLength: input.file.buffer.toString("base64").length,
            }
          : null,
      },
    },
    result: {
      content: JSON.stringify(output),
      usage: {
        promptTokens: response.usage?.input_tokens,
        completionTokens: response.usage?.output_tokens,
        totalTokens: response.usage?.total_tokens,
      },
    },
  });

  return { output, audit };
}
