// Mapeamento puro UserProfile -> CanonicalCvProfileData (mesmo shape que a
// extração por IA produz — master-cv-canonical-extraction.types.ts). Sem IA:
// os blocos de /meu-cv-master já gravam campos estruturados em UserProfile
// (experiencesJson/educationJson/skillsJson/languagesJson/certificationsJson),
// então virar um "CV canônico" a partir deles é só remontar o JSON.
//
// Usado por UserProfileMasterSyncService pra sincronizar edições diretas no
// UserProfile com o Master formal (CvMasterDesignation) usado em análises
// NOVAS — nunca reescreve análises/adaptações já existentes (seus
// cvStructuredProfileId ficam congelados pra sempre, por design/trigger de
// banco).
import type { UserProfile } from "@prisma/client";

import type { CanonicalCvProfileData } from "../cv-adaptation/cv-adaptation-ai.service";
import type {
  ProfileCertification,
  ProfileEducation,
  ProfileExperience,
  ProfileLanguage,
} from "./profile-canonical.types";

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function nonEmpty(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function mapUserProfileToCanonicalCvProfile(
  profile: UserProfile,
): CanonicalCvProfileData {
  const experiences = asArray<ProfileExperience>(profile.experiencesJson);
  const education = asArray<ProfileEducation>(profile.educationJson);
  const languages = asArray<ProfileLanguage>(profile.languagesJson);
  const certifications = asArray<ProfileCertification>(
    profile.certificationsJson,
  );
  const skillsRecord =
    profile.skillsJson &&
    typeof profile.skillsJson === "object" &&
    !Array.isArray(profile.skillsJson)
      ? (profile.skillsJson as {
          technical?: string[];
          business?: string[];
          soft?: string[];
        })
      : {};
  const skills = Array.from(
    new Set(
      [
        ...(skillsRecord.technical ?? []),
        ...(skillsRecord.business ?? []),
        ...(skillsRecord.soft ?? []),
      ].filter((s): s is string => typeof s === "string" && s.trim() !== ""),
    ),
  );

  return {
    fullName: nonEmpty(profile.fullName),
    headline: nonEmpty(profile.headline),
    email: nonEmpty(profile.contactEmail),
    phone: nonEmpty(profile.phone),
    linkedinUrl: nonEmpty(profile.linkedinUrl),
    location: {
      city: nonEmpty(profile.city),
      state: nonEmpty(profile.state),
      country: nonEmpty(profile.country),
    },
    professionalSummary: nonEmpty(
      profile.professionalSummary ?? profile.summary,
    ),
    experiences: experiences.map((exp) => ({
      role: nonEmpty(exp.role),
      company: nonEmpty(exp.company),
      location: null,
      startDate: nonEmpty(exp.startDate),
      endDate: nonEmpty(exp.endDate),
      bullets: [
        ...(nonEmpty(exp.description) ? [exp.description!.trim()] : []),
        ...(exp.achievements ?? []).filter(
          (b): b is string => typeof b === "string" && b.trim() !== "",
        ),
      ],
      technologies: (exp.relatedSkills ?? []).filter(
        (t): t is string => typeof t === "string" && t.trim() !== "",
      ),
    })),
    education: education.map((edu) => ({
      institution: nonEmpty(edu.institution),
      degree: nonEmpty(edu.degree),
      fieldOfStudy: nonEmpty(edu.fieldOfStudy),
      startDate: nonEmpty(edu.startDate),
      endDate: nonEmpty(edu.endDate),
    })),
    skills,
    languages: languages
      .filter((l) => nonEmpty(l.language))
      .map((l) => ({
        language: l.language.trim(),
        level: nonEmpty(l.level),
      })),
    certifications: certifications
      .filter((c) => nonEmpty(c.name))
      .map((c) => ({
        name: c.name.trim(),
        issuer: nonEmpty(c.issuer),
        year: nonEmpty(c.year),
      })),
  };
}

// true quando o UserProfile não tem NENHUM conteúdo de CV de verdade ainda
// (só campos de preferência/vazios) — nesse caso não há nada pra sincronizar
// como Master, e tentar promover um perfil vazio pisaria num Master real
// (upload de arquivo) sem necessidade.
export function isCanonicalCvProfileEffectivelyEmpty(
  profile: CanonicalCvProfileData,
): boolean {
  return (
    !profile.fullName &&
    !profile.professionalSummary &&
    profile.experiences.length === 0 &&
    profile.education.length === 0 &&
    profile.skills.length === 0 &&
    profile.languages.length === 0 &&
    profile.certifications.length === 0
  );
}

// Rendição em texto plano do perfil canônico — usada só como Resume.rawText
// do Resume dedicado que representa o Master sincronizado do UserProfile
// (nunca como entrada de IA: a análise em si lê canonicalJson estruturado,
// nunca este texto achatado). Mantém consumidores legados de Resume.rawText
// (fallback de header PDF/DOCX, telas que exibem preview) com algo
// minimamente útil em vez de string vazia.
export function flattenCanonicalCvProfileToText(
  profile: CanonicalCvProfileData,
): string {
  const lines: string[] = [];
  if (profile.fullName) lines.push(profile.fullName);
  const contact = [profile.email, profile.phone, profile.linkedinUrl]
    .filter(Boolean)
    .join(" | ");
  if (contact) lines.push(contact);
  if (profile.professionalSummary) {
    lines.push("", "Resumo profissional", profile.professionalSummary);
  }
  if (profile.experiences.length > 0) {
    lines.push("", "Experiência profissional");
    for (const exp of profile.experiences) {
      lines.push(
        [exp.role, exp.company].filter(Boolean).join(" - ") || "Experiência",
      );
      for (const bullet of exp.bullets) lines.push(`- ${bullet}`);
    }
  }
  if (profile.education.length > 0) {
    lines.push("", "Formação");
    for (const edu of profile.education) {
      lines.push([edu.degree, edu.institution].filter(Boolean).join(" - "));
    }
  }
  if (profile.skills.length > 0) {
    lines.push("", "Habilidades", profile.skills.join(", "));
  }
  return lines.join("\n");
}

// Serialização determinística (chaves ordenadas) pra hash estável — duas
// chamadas com o mesmo conteúdo semântico sempre produzem o mesmo
// textSha256, independente de ordem de inserção de campos no objeto.
export function stableSerializeCanonicalCvProfile(
  profile: CanonicalCvProfileData,
): string {
  const sortKeys = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(sortKeys);
    if (value && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([k, v]) => [k, sortKeys(v)]),
      );
    }
    return value;
  };
  return JSON.stringify(sortKeys(profile));
}
