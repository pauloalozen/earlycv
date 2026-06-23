const JOB_MIN_CHARS = 80;
const JOB_MAX_CHARS = 12_000;

const JOB_SIGNALS = [
  "requisitos",
  "responsabilidades",
  "vaga",
  "experiência",
  "experiencia",
  "habilidades",
  "perfil",
  "função",
  "funcao",
  "cargo",
  "empresa",
  "contratação",
  "contratacao",
  "candidato",
  "oportunidade",
  "buscamos",
  "procuramos",
  "requirements",
  "responsibilities",
  "job",
  "position",
  "skills",
  "role",
  "company",
  "hiring",
  "candidate",
];

export const JOB_DESCRIPTION_MAX_CHARS = JOB_MAX_CHARS;

export function validateJobDescription(text: string): string | null {
  const normalized = text.trim();

  if (!normalized || normalized.length < JOB_MIN_CHARS) {
    return "O texto informado não parece uma descrição de vaga. Cole uma descrição válida para continuar.";
  }

  if (normalized.length > JOB_MAX_CHARS) {
    return `A descrição da vaga não pode ter mais de ${JOB_MAX_CHARS.toLocaleString("pt-BR")} caracteres.`;
  }

  const lower = normalized.toLowerCase();
  const hasSignal = JOB_SIGNALS.some((s) => lower.includes(s));
  if (!hasSignal) {
    return "O texto informado não parece uma descrição de vaga. Cole uma descrição válida para continuar.";
  }

  return null;
}
