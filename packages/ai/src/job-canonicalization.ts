import type OpenAI from "openai";

import {
  buildSystemMessage,
  logAiUsage,
  stripJsonCodeFence,
} from "./prompt-cache.js";

const ALLOWED_WORK_MODES = ["remote", "hybrid", "onsite", null] as const;
const ALLOWED_EMPLOYMENT_TYPES = [
  "full_time",
  "part_time",
  "contract",
  "internship",
  "temporary",
  "freelance",
  null,
] as const;

export const JOB_CANONICALIZATION_PROMPT_VERSION = "2026-06-09.v3";

export type CanonicalJobJson = {
  title: string | null;
  company: string | null;
  location: string | null;
  workMode: (typeof ALLOWED_WORK_MODES)[number];
  employmentType: (typeof ALLOWED_EMPLOYMENT_TYPES)[number];
  description: string;
};

const DESCRIPTION_LABELS = new Set([
  "about the job",
  "additional information",
  "description da vaga",
  "description of the job",
  "description",
  "descrição da vaga",
  "descricao da vaga",
  "hiring process",
  "informações adicionais",
  "informacoes adicionais",
  "job description",
  "minimum qualifications",
  "nice to have",
  "preferred qualifications",
  "processo seletivo",
  "qualifications",
  "requirements",
  "requisitos",
  "requisitos e qualificações",
  "requisitos e qualificacoes",
  "responsibilities",
  "responsabilidades",
  "responsabilidades e atribuições",
  "responsabilidades e atribuicoes",
  "what we are looking for",
  "what you bring",
  "what you will do",
  "what you'll do",
  "who you are",
]);

const PROCESS_STEP_PATTERN = /^\d+[.)-]\s+/;
const BULLET_PREFIX_PATTERN = /^[-*•]\s+/;
const TITLE_PREFIX_PATTERN = /^(pessoa|profissional|person|candidate)\s+/i;
const REMOTE_AS_LOCATION = new Set([
  "flexible",
  "híbrido",
  "hibrido",
  "hybrid",
  "hybrid remote",
  "onsite",
  "presencial",
  "remote",
  "remota",
  "remoto",
]);

const DESCRIPTION_NOISE_PATTERNS = [
  /^about the job$/i,
  /^additional information$/i,
  /^apply$/i,
  /^apply now$/i,
  /^apply for this job$/i,
  /^this role is open to candidates with disabilities\.?$/i,
  /^candidate-se$/i,
  /^candidatar-se$/i,
  /^cadastre-se$/i,
  /^compartilhar$/i,
  /^copy link$/i,
  /^equal opportunity employer/i,
  /equal opportunity employer\.?$/i,
  /^esta vaga também está disponível/i,
  /^esta vaga tambem esta disponivel/i,
  /^for more information/i,
  /^hiring process$/i,
  /^inscreva-se$/i,
  /^job description$/i,
  /^link copied$/i,
  /^privacy policy$/i,
  /^promoted by recruiter$/i,
  /^report this job$/i,
  /^reposted$/i,
  /^salvar vaga$/i,
  /^save$/i,
  /^save job$/i,
  /^see how you compare$/i,
  /^see more$/i,
  /^share$/i,
  /^show more options$/i,
  /^vaga também disponível/i,
  /^vaga tambem disponivel/i,
  /^ver mais$/i,
  /^ver menos$/i,
];

const SYSTEM_PROMPT = `You are a precise job-posting cleanup engine. Return strict JSON only.

HARD RULES:
- Do not summarize the job.
- Do not rewrite freely.
- Do not add information.
- Do not invent the company, title, location, work mode, or employment type.
- Remove interface noise only: buttons, menus, navigation chrome, numbers of applicants, promotional copy, loose links, share widgets, and other non-job UI text.
- Remove platform/editorial labels when they are just section chrome and not actual job content. Examples in PT-BR: "Sobre a vaga", "Descrição da vaga", "Responsabilidades e atribuições", "Requisitos e qualificações", "Informações adicionais", "Processo seletivo". Examples in EN: "About the job", "Job description", "Responsibilities", "Requirements", "Qualifications", "Additional information", "Hiring process", "What you will do", "What we are looking for".
- Remove application-flow remnants such as numbered application steps, cadastro/entrevista/proposta checklists, ATS step lists, accessibility boilerplate, recruiter promotion tags, and CTA text like "apply", "apply now", "save job", "share", "copy link", "report this job".
- Preserve all relevant responsibilities, requirements, qualifications, benefits, stack details, and role information.
- If title, company, or location are unclear, return null for that field.
- If a so-called location field only states work mode such as remote, hybrid, onsite, presencial, flexible, set location to null and use workMode for that information.
- Normalize title by removing recruiting prefixes that do not change role identity, such as "Pessoa", "Profissional", "Person", or "Candidate", when they are stylistic only.
- description must keep the cleaned job content as close as possible to the original relevant text, but without the noise listed above.

Return exactly this JSON shape:
{
  "title": "string | null",
  "company": "string | null",
  "location": "string | null",
  "workMode": "remote | hybrid | onsite | null",
  "employmentType": "full_time | part_time | contract | internship | temporary | freelance | null",
  "description": "string"
}`;

function validateObject(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Invalid object at ${path}`);
  }

  return value as Record<string, unknown>;
}

function validateNullableString(value: unknown, path: string): string | null {
  if (value === null) {
    return null;
  }

  if (typeof value !== "string") {
    throw new Error(`Invalid string at ${path}`);
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function validateEnum<T extends readonly (string | null)[]>(
  value: unknown,
  path: string,
  allowed: T,
): T[number] {
  if (!allowed.includes(value as T[number])) {
    // Unknown enum value from model — fall back to null rather than throwing,
    // since both workMode and employmentType accept null and the model can return
    // locale-specific variants (e.g. "presencial", "CLT") not in the allowed list.
    return null as T[number];
  }

  return value as T[number];
}

function normalizeTitle(title: string | null): string | null {
  if (!title) {
    return null;
  }

  const normalized = title.replace(TITLE_PREFIX_PATTERN, "").trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeLocation(location: string | null): string | null {
  if (!location) {
    return null;
  }

  const normalized = location.trim();
  if (REMOTE_AS_LOCATION.has(normalized.toLowerCase())) {
    return null;
  }

  return normalized.length > 0 ? normalized : null;
}

function normalizeDescription(description: string): string {
  const cleanedLines = description
    .split(/\r?\n/)
    .map((line) => line.trim())
    .map((line) => line.replace(BULLET_PREFIX_PATTERN, "").trim())
    .filter((line) => line.length > 0)
    .filter(
      (line) => !DESCRIPTION_LABELS.has(line.replace(/:$/, "").toLowerCase()),
    )
    .filter((line) => !PROCESS_STEP_PATTERN.test(line))
    .filter(
      (line) =>
        !DESCRIPTION_NOISE_PATTERNS.some((pattern) => pattern.test(line)),
    );

  return cleanedLines.join("\n").trim();
}

function parseCanonicalJobJson(value: unknown): CanonicalJobJson {
  const record = validateObject(value, "root");
  const description = record.description;

  if (typeof description !== "string" || description.trim().length === 0) {
    throw new Error("Invalid string at description");
  }

  const normalizedDescription = normalizeDescription(description);
  if (normalizedDescription.length === 0) {
    throw new Error("Invalid string at description");
  }

  return {
    title: normalizeTitle(validateNullableString(record.title, "title")),
    company: validateNullableString(record.company, "company"),
    location: normalizeLocation(
      validateNullableString(record.location, "location"),
    ),
    workMode: validateEnum(record.workMode, "workMode", ALLOWED_WORK_MODES),
    employmentType: validateEnum(
      record.employmentType,
      "employmentType",
      ALLOWED_EMPLOYMENT_TYPES,
    ),
    description: normalizedDescription,
  };
}

export async function canonicalizeJobDescription(
  client: OpenAI,
  model: string,
  jobDescriptionText: string,
): Promise<CanonicalJobJson> {
  const normalizedInput = jobDescriptionText.trim();
  if (normalizedInput.length === 0) {
    throw new Error("jobDescriptionText is required");
  }

  const response = await client.chat.completions.create({
    model,
    messages: [
      buildSystemMessage(model, SYSTEM_PROMPT),
      { role: "user", content: normalizedInput },
    ],
    temperature: 0,
    response_format: { type: "json_object" },
  });
  logAiUsage("job-canonicalization", model, response.usage);

  const content = response.choices[0]?.message.content;
  if (!content) {
    throw new Error("Model returned empty canonical job output");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripJsonCodeFence(content));
  } catch (error) {
    throw new Error(
      `Failed to parse canonical job JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  return parseCanonicalJobJson(parsed);
}
