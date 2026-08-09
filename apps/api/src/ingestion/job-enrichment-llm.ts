import { ContractType, JobArea, SeniorityLevel } from "@prisma/client";
import type OpenAI from "openai";

export const JOB_ENRICHMENT_PROMPT_VERSION = "2026-08-08.v4";

const DESCRIPTION_MAX_CHARS = 6000;
const CAREER_FINGERPRINT_MAX_ITEMS = 6;

export type JobEnrichmentLlmInput = {
  department?: string | null;
  descriptionClean: string;
  title: string;
};

export type JobEnrichmentLlmResult = {
  areas: JobArea[];
  careerFingerprint: string[];
  certifications: string[];
  contractType: ContractType | null;
  dominantArea: JobArea | null;
  experienceYearsMin: number | null;
  languageRequirements: string[];
  managementRequired: boolean;
  optionalSkills: string[];
  requiredSkills: string[];
  seniority: SeniorityLevel | null;
  specialties: string[];
  technologies: string[];
  travelRequired: boolean;
};

export const SYSTEM_PROMPT = `Você é um sistema de classificação de vagas de emprego para um radar de oportunidades tech.

Analise a vaga abaixo e retorne EXCLUSIVAMENTE um JSON válido no formato especificado.

## Taxonomia de áreas disponíveis
DATA_AI: dados, analytics, BI, data engineering, data science, machine learning, AI, MLOps
SOFTWARE_ENGINEERING: desenvolvimento backend, frontend, fullstack, mobile, embedded
CLOUD_DEVOPS: cloud, devops, SRE, platform engineering, infraestrutura, redes
CYBERSECURITY: segurança da informação, pentest, AppSec, SOC, GRC, IAM
PRODUCT: product manager, product owner, gestão de produto
DESIGN_UX: UX design, UI design, product design, UX research
QA_TEST: QA, quality assurance, teste, automação de testes
PROJECT_AGILE: scrum master, agile coach, gestão de projetos tech, PMO tech
ARCHITECTURE: arquiteto de software, solutions architect, enterprise architect
LEADERSHIP: tech lead com gestão, engineering manager, head, CTO, CIO, diretor tech
GROWTH_MARKETING: growth hacker, growth analyst, performance marketing, SEO specialist,
SEM, CRO, CRM analyst, marketing ops, marketing digital, lifecycle marketing,
retention specialist, SDR (Sales Development Representative), BDR,
inbound/outbound sales em empresa tech, revenue operations, demand generation
BUSINESS_ANALYTICS: business analyst, business intelligence analyst, revenue ops,
pricing analyst, market intelligence, strategic analyst, planning analyst,
commercial analyst, sales ops, go-to-market analyst
CX_DIGITAL: customer experience designer, CX analyst, conversational designer,
UX researcher, service designer, customer success (em contexto de produto digital),
voice of customer analyst
OTHER: qualquer coisa que não se encaixe nas categorias acima

## Regras de classificação para casos ambíguos
- SDR/BDR: só classifica como GROWTH_MARKETING se for em empresa tech/digital.
  Em empresa tradicional (banco, indústria), classifica como OTHER.
- Business Analyst: se focado em dados/produto → BUSINESS_ANALYTICS.
  Se focado em requisitos de software → SOFTWARE_ENGINEERING.
  Se focado em processos de negócio tradicionais → OTHER.
- Customer Success: só CX_DIGITAL se o trabalho envolve produto digital diretamente.
  CS comercial/vendas em empresa não-tech → OTHER.

## Formato de resposta (JSON estrito, sem texto fora do JSON)
{
  "dominantArea": "<JobArea>",
  "areas": ["<JobArea>"],
  "specialties": ["<string>"],
  "seniority": "<SeniorityLevel>",
  "requiredSkills": ["<string>"],
  "optionalSkills": ["<string>"],
  "technologies": ["<string>"],
  "contractType": "<ContractType>",
  "languageRequirements": ["<string>"],
  "certifications": [],
  "experienceYearsMin": <int ou null>,
  "managementRequired": <boolean>,
  "travelRequired": <boolean>,
  "careerFingerprint": ["<string>"]
}

## Regras importantes
- Se dominantArea for OTHER, retorne o JSON com todos os outros campos vazios/null
- careerFingerprint: máximo 6 labels concisos em português que descrevem o profissional ideal (ex: ["Engenheiro Backend", "Java", "AWS", "Microsserviços", "Sênior"])
- requiredSkills: só o que é explicitamente obrigatório na descrição
- optionalSkills: o que é "diferencial" ou "desejável"
- technologies: frameworks, linguagens, ferramentas (ex: "Python", "React", "Kubernetes")
- specialties: sub-área dentro da área principal (ex: para DATA_AI: "data engineering", "analytics")
- CRÍTICO — requiredSkills/optionalSkills/technologies devem ser termos atômicos, NUNCA frases ou sentenças copiadas da descrição:
  - cada item é uma única skill, ferramenta, framework, norma, certificação ou tecnologia (ex: "sox", "iso 27002", "lgpd", "kubernetes", "power bi")
  - nunca inclua verbos, conectores ou texto de contexto no item (nada de "conhecimento em", "experiência com", "capacidade de", "ter atuado em")
  - se um trecho da vaga cita várias skills juntas (ex: "conhecimento em normas e regulamentações SOX, ISO 27002 e LGPD"), quebre em um item por skill: ["sox", "iso 27002", "lgpd"] — nunca ["conhecimento em normas e regulamentações sox, iso 27002 e lgpd"]
  - o mesmo vale para listas de alternativas ("X, Y ou Z") em qualquer seção da vaga, incluindo requisitos, diferenciais e responsabilidades — cada alternativa é um item separado, não é opcional escolher só uma: ex "Conhecimento em PowerShell, Shell Script ou Python para automação; Microsoft SQL Server, Oracle ou PostgreSQL" vira ["powershell", "shell script", "python", "microsoft sql server", "oracle", "postgresql"]
  - varra a vaga inteira, incluindo seções de "diferenciais"/"desejável" — não pare de extrair após a primeira lista de tecnologias encontrada
  - trechos que descrevem responsabilidades/atividades genéricas sem citar uma skill/ferramenta/norma específica (ex: "ter atuado em empresas que promovem esse ambiente") NÃO viram item de requiredSkills — descarte-os
- Normalize para lowercase em requiredSkills, optionalSkills, technologies
- SeniorityLevel válidos: INTERN | JUNIOR | MID | SENIOR | LEAD | STAFF | MANAGER | DIRECTOR | UNKNOWN
- ContractType válidos: CLT | PJ | BOTH | UNKNOWN
- Se informação não disponível, use null ou [] — nunca invente`;

export function buildJobEnrichmentPrompt(input: JobEnrichmentLlmInput) {
  const description = input.descriptionClean
    .trim()
    .slice(0, DESCRIPTION_MAX_CHARS);

  return `## Vaga
Título: ${input.title}
Empresa/Departamento: ${input.department?.trim() || "não informado"}
Descrição: ${description}`;
}

function toStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function toLowerStringArray(value: unknown) {
  return toStringArray(value).map((item) => item.toLowerCase());
}

function toJobAreaArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is JobArea =>
    Object.values(JobArea).includes(item as JobArea),
  );
}

function toJobArea(value: unknown): JobArea | null {
  return typeof value === "string" &&
    Object.values(JobArea).includes(value as JobArea)
    ? (value as JobArea)
    : null;
}

function toSeniorityLevel(value: unknown): SeniorityLevel | null {
  return typeof value === "string" &&
    Object.values(SeniorityLevel).includes(value as SeniorityLevel)
    ? (value as SeniorityLevel)
    : null;
}

function toContractType(value: unknown): ContractType | null {
  return typeof value === "string" &&
    Object.values(ContractType).includes(value as ContractType)
    ? (value as ContractType)
    : null;
}

function toNullableInt(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.trunc(value);
}

export function parseJobEnrichmentJson(raw: unknown): JobEnrichmentLlmResult {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("Job enrichment response is not a JSON object");
  }

  const record = raw as Record<string, unknown>;

  return {
    areas: toJobAreaArray(record.areas),
    careerFingerprint: toStringArray(record.careerFingerprint).slice(
      0,
      CAREER_FINGERPRINT_MAX_ITEMS,
    ),
    certifications: toStringArray(record.certifications),
    contractType: toContractType(record.contractType),
    dominantArea: toJobArea(record.dominantArea),
    experienceYearsMin: toNullableInt(record.experienceYearsMin),
    languageRequirements: toStringArray(record.languageRequirements),
    managementRequired: record.managementRequired === true,
    optionalSkills: toLowerStringArray(record.optionalSkills),
    requiredSkills: toLowerStringArray(record.requiredSkills),
    seniority: toSeniorityLevel(record.seniority),
    specialties: toStringArray(record.specialties),
    technologies: toLowerStringArray(record.technologies),
    travelRequired: record.travelRequired === true,
  };
}

export async function enrichJobWithLlm(
  client: OpenAI,
  model: string,
  input: JobEnrichmentLlmInput,
): Promise<JobEnrichmentLlmResult> {
  const { buildDeepSeekExtraBody, buildSystemMessage, stripJsonCodeFence } =
    await import("@earlycv/ai");

  const response = await client.chat.completions.create({
    model,
    messages: [
      buildSystemMessage(model, SYSTEM_PROMPT),
      { role: "user", content: buildJobEnrichmentPrompt(input) },
    ],
    temperature: 0,
    response_format: { type: "json_object" },
    ...buildDeepSeekExtraBody(model),
  });

  const content = response.choices[0]?.message.content;
  if (!content) {
    throw new Error("Model returned empty job enrichment output");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripJsonCodeFence(content));
  } catch (error) {
    throw new Error(
      `Failed to parse job enrichment JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  return parseJobEnrichmentJson(parsed);
}
