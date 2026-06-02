export type ProfileRemotePreference =
  | "remote"
  | "hybrid"
  | "onsite"
  | "flexible";

export type ProfileSkillsJson = {
  business: string[];
  soft: string[];
  technical: string[];
};

export type UserProfileRecord = {
  certificationsJson: unknown;
  city: string | null;
  country: string | null;
  currentTitle: string | null;
  createdAt?: string;
  educationJson: unknown;
  experiencesJson: unknown;
  fullName: string | null;
  headline: string | null;
  id: string;
  languagesJson: unknown;
  linkedinUrl: string | null;
  phone: string | null;
  preferredLanguage: string | null;
  profileFieldMetaJson: unknown;
  profileReadinessStatus: "empty" | "partial" | "ready";
  profileSuggestionsJson: unknown;
  professionalSummary: string | null;
  relocationPreference: boolean | null;
  remotePreference: ProfileRemotePreference | null;
  skillsJson: ProfileSkillsJson | null;
  state: string | null;
  summary: string | null;
  targetSalaryMax: number | null;
  targetSalaryMin: number | null;
  updatedAt?: string;
  userId: string;
  yearsExperience: number | null;
};

type ProfileFieldType =
  | "text"
  | "number"
  | "textarea"
  | "select"
  | "checkbox"
  | "json";

export type ProfileFieldDefinition = {
  helpText?: string;
  label: string;
  name: keyof Pick<
    UserProfileRecord,
    | "certificationsJson"
    | "city"
    | "country"
    | "currentTitle"
    | "educationJson"
    | "experiencesJson"
    | "fullName"
    | "headline"
    | "languagesJson"
    | "linkedinUrl"
    | "phone"
    | "preferredLanguage"
    | "professionalSummary"
    | "relocationPreference"
    | "remotePreference"
    | "skillsJson"
    | "state"
    | "summary"
    | "targetSalaryMax"
    | "targetSalaryMin"
    | "yearsExperience"
  >;
  options?: Array<{ label: string; value: string }>;
  rows?: number;
  type: ProfileFieldType;
};

export type ProfileBlockId =
  | "identity"
  | "contact"
  | "location"
  | "goals"
  | "experiences"
  | "education"
  | "skills"
  | "languages"
  | "certifications";

export type ProfileBlockDefinition = {
  description: string;
  fields: ProfileFieldDefinition[];
  id: ProfileBlockId;
  title: string;
};

export type ProfileBlockState = ProfileBlockDefinition & {
  gapHint: string;
  hasGap: boolean;
  missingCount: number;
  missingFields: string[];
};

export const profileBlockDefinitions: ProfileBlockDefinition[] = [
  {
    id: "identity",
    title: "Identidade profissional",
    description: "Nome, cargo atual, headline e resumo principal.",
    fields: [
      { name: "fullName", label: "Nome completo", type: "text" },
      { name: "headline", label: "Headline", type: "text" },
      { name: "currentTitle", label: "Cargo atual", type: "text" },
      {
        name: "professionalSummary",
        label: "Resumo profissional",
        rows: 4,
        type: "textarea",
      },
      { name: "summary", label: "Resumo curto", rows: 4, type: "textarea" },
    ],
  },
  {
    id: "contact",
    title: "Contato",
    description: "Telefone e perfil público para o recrutador.",
    fields: [
      { name: "phone", label: "Telefone", type: "text" },
      { name: "linkedinUrl", label: "LinkedIn", type: "text" },
    ],
  },
  {
    id: "location",
    title: "Localização",
    description: "Cidade, estado, país e idioma preferido.",
    fields: [
      { name: "city", label: "Cidade", type: "text" },
      { name: "state", label: "Estado", type: "text" },
      { name: "country", label: "País", type: "text" },
      { name: "preferredLanguage", label: "Idioma preferido", type: "text" },
    ],
  },
  {
    id: "goals",
    title: "Direção de carreira",
    description: "Experiência, preferência remota e faixa salarial.",
    fields: [
      { name: "yearsExperience", label: "Anos de experiência", type: "number" },
      {
        name: "remotePreference",
        label: "Preferência remota",
        options: [
          { label: "Remoto", value: "remote" },
          { label: "Híbrido", value: "hybrid" },
          { label: "Presencial", value: "onsite" },
          { label: "Flexível", value: "flexible" },
        ],
        type: "select",
      },
      {
        name: "relocationPreference",
        label: "Aceita mudança de cidade",
        type: "checkbox",
      },
      { name: "targetSalaryMin", label: "Pretensão mínima", type: "number" },
      { name: "targetSalaryMax", label: "Pretensão máxima", type: "number" },
    ],
  },
  {
    id: "experiences",
    title: "Experiências",
    description: "Estrutura factual das experiências de trabalho.",
    fields: [
      {
        helpText: "Use JSON válido com a lista de experiências.",
        label: "Experiências (JSON)",
        name: "experiencesJson",
        rows: 10,
        type: "json",
      },
    ],
  },
  {
    id: "education",
    title: "Formação",
    description: "Cursos, graduações e registros acadêmicos.",
    fields: [
      {
        helpText: "Use JSON válido com a lista de formações.",
        label: "Formação (JSON)",
        name: "educationJson",
        rows: 8,
        type: "json",
      },
    ],
  },
  {
    id: "skills",
    title: "Habilidades e competências",
    description: "Competências técnicas, de negócio e comportamentais.",
    fields: [
      {
        helpText: "Use JSON válido com technical, business e soft.",
        label: "Habilidades e competências (JSON)",
        name: "skillsJson",
        rows: 10,
        type: "json",
      },
    ],
  },
  {
    id: "languages",
    title: "Idiomas",
    description: "Idiomas com o formato que você já usa no CV.",
    fields: [
      {
        helpText: "Use JSON válido com a lista de idiomas.",
        label: "Idiomas (JSON)",
        name: "languagesJson",
        rows: 6,
        type: "json",
      },
    ],
  },
  {
    id: "certifications",
    title: "Certificações e cursos",
    description: "Certificações, cursos e credenciais relevantes.",
    fields: [
      {
        helpText: "Use JSON válido com a lista de certificações.",
        label: "Certificações (JSON)",
        name: "certificationsJson",
        rows: 6,
        type: "json",
      },
    ],
  },
];

function hasText(value: string | null | undefined) {
  return Boolean(value?.trim());
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asSkillsJson(value: ProfileSkillsJson | null) {
  return value ?? { business: [], soft: [], technical: [] };
}

function isEmptySkills(value: ProfileSkillsJson | null) {
  const skills = asSkillsJson(value);
  return (
    skills.technical.length + skills.business.length + skills.soft.length === 0
  );
}

function isEmptyJsonValue(value: unknown) {
  return asArray(value).length === 0;
}

function missingLabelCount(labels: string[]) {
  if (labels.length === 0) {
    return "Tudo conferido";
  }

  if (labels.length === 1) {
    return `Falta ${labels[0]}`;
  }

  if (labels.length === 2) {
    return `Faltam ${labels[0]} e ${labels[1]}`;
  }

  return `Faltam ${labels[0]}, ${labels[1]} e mais ${labels.length - 2}`;
}

function isFieldMissing(
  profile: UserProfileRecord | null,
  field: ProfileFieldDefinition,
) {
  if (!profile) {
    return true;
  }

  const value = profile[field.name as keyof UserProfileRecord];

  switch (field.type) {
    case "checkbox":
      return value === null || value === undefined;
    case "number":
      return value === null || value === undefined;
    case "select":
    case "text":
    case "textarea":
      return !hasText(typeof value === "string" ? value : null);
    case "json":
      if (field.name === "skillsJson") {
        return isEmptySkills(value as ProfileSkillsJson | null);
      }

      return isEmptyJsonValue(value);
    default:
      return true;
  }
}

export function buildProfileBlockStates(
  profile: UserProfileRecord | null,
): ProfileBlockState[] {
  return profileBlockDefinitions.map((definition) => {
    const missingFields = definition.fields
      .filter((field) => isFieldMissing(profile, field))
      .map((field) => field.label);

    return {
      ...definition,
      gapHint: missingLabelCount(missingFields),
      hasGap: missingFields.length > 0,
      missingCount: missingFields.length,
      missingFields,
    };
  });
}

export function getPrimaryGapBlockId(blocks: ProfileBlockState[]) {
  return blocks.find((block) => block.hasGap)?.id ?? null;
}

function readString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function readNumber(formData: FormData, key: string) {
  const value = readString(formData, key);
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function readBoolean(formData: FormData, key: string) {
  return formData.get(key) === "on";
}

function readJson<T>(formData: FormData, key: string, fallback: T): T {
  const value = readString(formData, key);
  if (!value) {
    return fallback;
  }

  return JSON.parse(value) as T;
}

export function buildProfileBlockUpdatePayload(
  blockId: ProfileBlockId,
  formData: FormData,
) {
  switch (blockId) {
    case "identity":
      return {
        currentTitle: readString(formData, "currentTitle"),
        fullName: readString(formData, "fullName"),
        headline: readString(formData, "headline"),
        professionalSummary: readString(formData, "professionalSummary"),
        summary: readString(formData, "summary"),
      };
    case "contact":
      return {
        linkedinUrl: readString(formData, "linkedinUrl"),
        phone: readString(formData, "phone"),
      };
    case "location":
      return {
        city: readString(formData, "city"),
        country: readString(formData, "country"),
        preferredLanguage: readString(formData, "preferredLanguage"),
        state: readString(formData, "state"),
      };
    case "goals":
      return {
        yearsExperience: readNumber(formData, "yearsExperience"),
        remotePreference: readString(formData, "remotePreference") || undefined,
        relocationPreference: readBoolean(formData, "relocationPreference"),
        targetSalaryMin: readNumber(formData, "targetSalaryMin"),
        targetSalaryMax: readNumber(formData, "targetSalaryMax"),
      };
    case "experiences":
      return {
        experiencesJson: readJson(formData, "experiencesJson", [] as unknown[]),
      };
    case "education":
      return {
        educationJson: readJson(formData, "educationJson", [] as unknown[]),
      };
    case "skills":
      return {
        skillsJson: readJson(formData, "skillsJson", {
          business: [],
          soft: [],
          technical: [],
        } satisfies ProfileSkillsJson),
      };
    case "languages":
      return {
        languagesJson: readJson(formData, "languagesJson", [] as unknown[]),
      };
    case "certifications":
      return {
        certificationsJson: readJson(
          formData,
          "certificationsJson",
          [] as unknown[],
        ),
      };
  }
}

export function getProfileFieldDefaultValue(
  profile: UserProfileRecord,
  field: ProfileFieldDefinition,
) {
  const value = profile[field.name as keyof UserProfileRecord];

  switch (field.type) {
    case "checkbox":
      return Boolean(value);
    case "number":
      return typeof value === "number" ? String(value) : "";
    case "select":
    case "text":
    case "textarea":
      return typeof value === "string" ? value : "";
    case "json":
      if (field.name === "skillsJson") {
        return JSON.stringify(
          asSkillsJson(value as ProfileSkillsJson | null),
          null,
          2,
        );
      }

      return JSON.stringify(asArray(value), null, 2);
    default:
      return "";
  }
}
