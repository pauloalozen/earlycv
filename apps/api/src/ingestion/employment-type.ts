// Tipo de contratação normalizado (decisão F do PR 2b). Cada adapter manda
// o valor no vocabulário da sua fonte ("CLT", "Full time",
// "vacancy_type_effective", "estágio"...). A ingestão grava o valor cru em
// employmentTypeRaw e o normalizado em employmentType, sempre um destes:
export const EMPLOYMENT_TYPES = [
  "clt",
  "full_time",
  "part_time",
  "internship",
  "apprentice",
  "trainee",
  "temporary",
  "pj",
  "autonomous",
  "talent_pool",
] as const;

export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];

// Chave: minúsculas, sem acento, separadores viram "_".
const EMPLOYMENT_TYPE_BY_KEY: Record<string, EmploymentType> = {
  // CLT fica separado de full_time: no Brasil o regime importa (CLT x PJ),
  // e "Full time" de board global não diz qual é.
  clt: "clt",
  efetivo: "clt",
  vacancy_type_effective: "clt",
  full_time: "full_time",
  fulltime: "full_time",
  full_time_permanent: "full_time",
  permanent: "full_time",
  employee: "full_time",
  part_time: "part_time",
  parttime: "part_time",
  partial_time: "part_time",
  meio_periodo: "part_time",
  internship: "internship",
  intern: "internship",
  estagio: "internship",
  vacancy_type_internship: "internship",
  apprentice: "apprentice",
  aprendiz: "apprentice",
  jovem_aprendiz: "apprentice",
  vacancy_type_apprentice: "apprentice",
  trainee: "trainee",
  vacancy_type_trainee: "trainee",
  temporary: "temporary",
  temporario: "temporary",
  contrato_temporario: "temporary",
  full_time_fixed_term: "temporary",
  vacancy_type_temporary: "temporary",
  pj: "pj",
  pessoa_juridica: "pj",
  contractor: "pj",
  vacancy_legal_entity: "pj",
  autonomous: "autonomous",
  autonomo: "autonomous",
  freelancer: "autonomous",
  vacancy_type_autonomous: "autonomous",
  vacancy_type_freelancer: "autonomous",
  talent_pool: "talent_pool",
  vacancy_type_talent_pool: "talent_pool",
  banco_de_talentos: "talent_pool",
};

function employmentTypeKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[\s_-]+/g, "_");
}

// "Homeoffice" é modelo de trabalho, não contratação (já vira remote): fica
// sem tipo. Valor fora do mapa (vacancy_type_associate, lecturer,
// cooperado, outsource...) também fica sem tipo; o cru continua salvo.
export function normalizeEmploymentType(
  value: string | null | undefined,
): EmploymentType | null {
  if (!value?.trim()) return null;
  return EMPLOYMENT_TYPE_BY_KEY[employmentTypeKey(value)] ?? null;
}

// Banco de talentos anunciado como vaga comum ("Banco de Talentos - Tech
// Lead", "Field Service Engineer (Talent Pool)"). Não é vaga aberta: a
// política do Google proíbe JobPosting nesse caso.
const TALENT_POOL_TITLE =
  /\bbanco\s+de\s+talentos?\b|\btalent\s*pool\b|\btalent\s+community\b|\bcadastro\s+reserva\b/i;

export function isTalentPoolTitle(title: string): boolean {
  return TALENT_POOL_TITLE.test(title);
}

export function resolveEmploymentType(input: {
  employmentType?: string | null;
  employmentTypeRaw?: string | null;
  title: string;
}): {
  employmentType: EmploymentType | null;
  employmentTypeRaw: string | null;
} {
  const employmentTypeRaw =
    input.employmentTypeRaw?.trim() || input.employmentType?.trim() || null;
  if (isTalentPoolTitle(input.title)) {
    return { employmentType: "talent_pool", employmentTypeRaw };
  }
  // O cru vem primeiro: alguns adapters já achatam o valor antes (Gupy e
  // Sólides mandam "Efetivo"/"CLT" como full_time).
  return {
    employmentType:
      normalizeEmploymentType(input.employmentTypeRaw) ??
      normalizeEmploymentType(input.employmentType),
    employmentTypeRaw,
  };
}
