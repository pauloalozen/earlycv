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
  contactEmail: string | null;
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
    | "contactEmail"
    | "country"
    | "educationJson"
    | "experiencesJson"
    | "fullName"
    | "languagesJson"
    | "linkedinUrl"
    | "phone"
    | "professionalSummary"
    | "skillsJson"
    | "state"
  >;
  options?: Array<{ label: string; value: string }>;
  rows?: number;
  type: ProfileFieldType;
};

export type ProfileBlockId =
  | "dados-pessoais"
  | "resumo"
  | "experiencias"
  | "formacao"
  | "habilidades"
  | "idiomas"
  | "certificacoes"
  | "links";

// linksJson is a local-only type for additional URLs; no backend field yet.
export type LinkEntry = { label: string; url: string };

export type ProfileBlockDefinition = {
  description: string;
  fields: ProfileFieldDefinition[];
  id: ProfileBlockId;
  optional?: boolean;
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
    id: "dados-pessoais",
    title: "Dados pessoais e contato",
    description:
      "Nome, email, telefone, LinkedIn e localização para o recrutador.",
    fields: [
      { name: "fullName", label: "Nome completo", type: "text" },
      { name: "contactEmail", label: "Email de contato", type: "text" },
      { name: "phone", label: "Telefone", type: "text" },
      { name: "linkedinUrl", label: "LinkedIn", type: "text" },
      { name: "city", label: "Cidade", type: "text" },
      { name: "state", label: "Estado", type: "text" },
    ],
  },
  {
    id: "resumo",
    title: "Resumo profissional",
    description: "Resumo de abertura e posicionamento de carreira.",
    fields: [
      {
        name: "professionalSummary",
        label: "Resumo profissional",
        rows: 5,
        type: "textarea",
      },
    ],
  },
  {
    id: "experiencias",
    title: "Experiências profissionais",
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
    id: "formacao",
    title: "Formação acadêmica",
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
    id: "habilidades",
    title: "Skills e competências",
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
    id: "idiomas",
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
    id: "certificacoes",
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
  {
    id: "links",
    title: "Links",
    description: "Links adicionais (portfólio, GitHub, etc.).",
    fields: [],
    optional: true,
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
      hasGap: definition.optional ? false : missingFields.length > 0,
      missingCount: definition.optional ? 0 : missingFields.length,
      missingFields: definition.optional ? [] : missingFields,
    };
  });
}

export function getPrimaryGapBlockId(blocks: ProfileBlockState[]) {
  return blocks.find((block) => !block.optional && block.hasGap)?.id ?? null;
}

function readString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
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
    case "dados-pessoais":
      return {
        city: readString(formData, "city"),
        contactEmail: readString(formData, "contactEmail"),
        country: readString(formData, "country"),
        fullName: readString(formData, "fullName"),
        linkedinUrl: readString(formData, "linkedinUrl"),
        phone: readString(formData, "phone"),
        state: readString(formData, "state"),
      };
    case "resumo":
      return {
        professionalSummary: readString(formData, "professionalSummary"),
      };
    case "experiencias":
      return {
        experiencesJson: readJson(formData, "experiencesJson", [] as unknown[]),
      };
    case "formacao":
      return {
        educationJson: readJson(formData, "educationJson", [] as unknown[]),
      };
    case "habilidades":
      return {
        skillsJson: readJson(formData, "skillsJson", {
          business: [],
          soft: [],
          technical: [],
        } satisfies ProfileSkillsJson),
      };
    case "idiomas":
      return {
        languagesJson: readJson(formData, "languagesJson", [] as unknown[]),
      };
    case "certificacoes":
      return {
        certificationsJson: readJson(
          formData,
          "certificationsJson",
          [] as unknown[],
        ),
      };
    case "links":
      // Extra link entries are display-only; no dedicated backend field yet.
      return {};
  }
}

export function buildClearBlockPayload(blockId: ProfileBlockId) {
  const emptySkills: ProfileSkillsJson = {
    technical: [],
    business: [],
    soft: [],
  };
  switch (blockId) {
    case "dados-pessoais":
      return {
        fullName: "",
        contactEmail: "",
        phone: "",
        linkedinUrl: "",
        city: "",
        state: "",
        country: "",
      };
    case "resumo":
      return { professionalSummary: "" };
    case "experiencias":
      return { experiencesJson: [] as unknown[] };
    case "formacao":
      return { educationJson: [] as unknown[] };
    case "habilidades":
      return { skillsJson: emptySkills };
    case "idiomas":
      return { languagesJson: [] as unknown[] };
    case "certificacoes":
      return { certificationsJson: [] as unknown[] };
    case "links":
      return {};
  }
}

export function buildClearAllPayload() {
  return {
    fullName: "",
    contactEmail: "",
    phone: "",
    linkedinUrl: "",
    city: "",
    state: "",
    country: "",
    professionalSummary: "",
    experiencesJson: [] as unknown[],
    educationJson: [] as unknown[],
    skillsJson: {
      technical: [],
      business: [],
      soft: [],
    } satisfies ProfileSkillsJson,
    languagesJson: [] as unknown[],
    certificationsJson: [] as unknown[],
  };
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
