// Vocabulario "vacancy_type_*" — visto tanto no Gupy quanto no TalentBrew
// (a vaga de exemplo do Itau trouxe employmentType: "vacancy_type_effective"
// no JSON-LD, o mesmo valor que o Gupy usa). Nao sabemos se um platform usa
// o outro por baixo ou se e so convencao de mercado compartilhada — na
// duvida, mantemos o mapeamento compartilhado em vez de duplicar.
const EMPLOYMENT_TYPE_MAP: Record<string, string> = {
  vacancy_type_effective: "full_time",
  vacancy_type_internship: "internship",
  vacancy_type_apprentice: "apprentice",
  vacancy_type_temporary: "temporary",
  vacancy_type_talent_pool: "talent_pool",
  vacancy_legal_entity: "pj",
  vacancy_type_autonomous: "autonomous",
  full_time: "full_time",
};

export function normalizeVacancyType(value?: string | null) {
  const raw = value?.trim();
  if (!raw) return undefined;
  return EMPLOYMENT_TYPE_MAP[raw] ?? raw;
}
