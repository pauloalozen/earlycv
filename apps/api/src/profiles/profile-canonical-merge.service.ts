import { Injectable } from "@nestjs/common";

import type {
  CanonicalProfileData,
  ProfileFieldMetaEntry,
  ProfileSuggestion,
} from "./profile-canonical.types";

type MergeSource =
  | "analysis_upload"
  | "base_cv_upload"
  | "base_cv_ai_extraction"
  | "manual_edit";

type MergeInput = {
  existing: Partial<CanonicalProfileData>;
  incoming: Partial<CanonicalProfileData>;
  source: MergeSource;
  sourceCvId?: string | null;
  fieldMeta?: Record<string, ProfileFieldMetaEntry>;
  suggestions?: ProfileSuggestion[];
  extractionContext?: {
    confidence?: Record<string, number>;
    extractedAt?: string;
  };
};

type MergeResult = {
  next: Partial<CanonicalProfileData>;
  fieldMeta: Record<string, ProfileFieldMetaEntry>;
  suggestions: ProfileSuggestion[];
};

type ScalarFieldPath =
  | "fullName"
  | "phone"
  | "linkedinUrl"
  | "city"
  | "state"
  | "country"
  | "headline"
  | "professionalSummary";

@Injectable()
export class ProfileCanonicalMergeService {
  merge(input: MergeInput): MergeResult {
    const nowIso = new Date().toISOString();
    const next: Partial<CanonicalProfileData> = {
      ...input.existing,
      experiences: input.existing.experiences ?? [],
      education: input.existing.education ?? [],
      skills: input.existing.skills ?? {
        technical: [],
        business: [],
        soft: [],
      },
    };
    const fieldMeta = { ...(input.fieldMeta ?? {}) };
    const suggestions = [...(input.suggestions ?? [])];

    this.mergeScalar({
      fieldPath: "fullName",
      next,
      incoming: input.incoming.fullName,
      source: input.source,
      sourceCvId: input.sourceCvId,
      fieldMeta,
      suggestions,
      nowIso,
      extractionContext: input.extractionContext,
    });
    this.mergeScalar({
      fieldPath: "phone",
      next,
      incoming: input.incoming.phone,
      source: input.source,
      sourceCvId: input.sourceCvId,
      fieldMeta,
      suggestions,
      nowIso,
      normalize: this.normalizePhone,
      extractionContext: input.extractionContext,
    });
    this.mergeScalar({
      fieldPath: "linkedinUrl",
      next,
      incoming: input.incoming.linkedinUrl,
      source: input.source,
      sourceCvId: input.sourceCvId,
      fieldMeta,
      suggestions,
      nowIso,
      normalize: this.normalizeLinkedin,
      extractionContext: input.extractionContext,
    });
    this.mergeScalar({
      fieldPath: "city",
      next,
      incoming: input.incoming.city,
      source: input.source,
      sourceCvId: input.sourceCvId,
      fieldMeta,
      suggestions,
      nowIso,
      extractionContext: input.extractionContext,
    });
    this.mergeScalar({
      fieldPath: "state",
      next,
      incoming: input.incoming.state,
      source: input.source,
      sourceCvId: input.sourceCvId,
      fieldMeta,
      suggestions,
      nowIso,
      extractionContext: input.extractionContext,
    });
    this.mergeScalar({
      fieldPath: "country",
      next,
      incoming: input.incoming.country,
      source: input.source,
      sourceCvId: input.sourceCvId,
      fieldMeta,
      suggestions,
      nowIso,
      extractionContext: input.extractionContext,
    });
    this.mergeScalar({
      fieldPath: "headline",
      next,
      incoming: input.incoming.headline,
      source: input.source,
      sourceCvId: input.sourceCvId,
      fieldMeta,
      suggestions,
      nowIso,
      extractionContext: input.extractionContext,
    });
    this.mergeScalar({
      fieldPath: "professionalSummary",
      next,
      incoming: input.incoming.professionalSummary,
      source: input.source,
      sourceCvId: input.sourceCvId,
      fieldMeta,
      suggestions,
      nowIso,
      extractionContext: input.extractionContext,
    });

    if (input.incoming.experiences) {
      const shouldGateExperiences =
        input.source === "base_cv_ai_extraction" &&
        this.isLowConfidence(input.extractionContext, "experiences") &&
        (next.experiences ?? []).length > 0;
      if (!shouldGateExperiences) {
        next.experiences = this.mergeExperiences({
          existing: next.experiences ?? [],
          incoming: input.incoming.experiences,
          source: input.source,
          sourceCvId: input.sourceCvId,
          fieldMeta,
          suggestions,
          nowIso,
        });
      }
    }

    if (input.incoming.education) {
      const shouldGateEducation =
        input.source === "base_cv_ai_extraction" &&
        this.isLowConfidence(input.extractionContext, "education") &&
        (next.education ?? []).length > 0;
      if (!shouldGateEducation) {
        next.education = [...input.incoming.education];
      }
    }

    if (input.incoming.skills) {
      const shouldGateTechnical =
        input.source === "base_cv_ai_extraction" &&
        this.isLowConfidence(input.extractionContext, "skills.technical") &&
        (next.skills?.technical?.length ?? 0) > 0;
      const shouldGateBusiness =
        input.source === "base_cv_ai_extraction" &&
        this.isLowConfidence(input.extractionContext, "skills.business") &&
        (next.skills?.business?.length ?? 0) > 0;
      const shouldGateSoft =
        input.source === "base_cv_ai_extraction" &&
        this.isLowConfidence(input.extractionContext, "skills.soft") &&
        (next.skills?.soft?.length ?? 0) > 0;

      const mergedSkills = {
        technical: shouldGateTechnical
          ? (next.skills?.technical ?? [])
          : this.mergeSkillsBucket(
              next.skills?.technical ?? [],
              input.incoming.skills.technical ?? [],
            ),
        business: shouldGateBusiness
          ? (next.skills?.business ?? [])
          : this.mergeSkillsBucket(
              next.skills?.business ?? [],
              input.incoming.skills.business ?? [],
            ),
        soft: shouldGateSoft
          ? (next.skills?.soft ?? [])
          : this.mergeSkillsBucket(
              next.skills?.soft ?? [],
              input.incoming.skills.soft ?? [],
            ),
      };

      next.skills = mergedSkills;
    }

    return { next, fieldMeta, suggestions };
  }

  private mergeScalar(input: {
    fieldPath: ScalarFieldPath;
    next: Partial<CanonicalProfileData>;
    incoming: string | undefined;
    source: MergeSource;
    sourceCvId?: string | null;
    fieldMeta: Record<string, ProfileFieldMetaEntry>;
    suggestions: ProfileSuggestion[];
    nowIso: string;
    normalize?: (value: string) => string;
    extractionContext?: {
      confidence?: Record<string, number>;
      extractedAt?: string;
    };
  }) {
    if (typeof input.incoming !== "string") {
      return;
    }

    const trimmedIncoming = input.incoming.trim();
    if (!trimmedIncoming) {
      return;
    }

    const key = String(input.fieldPath);
    const currentRaw = input.next[input.fieldPath];
    const current = typeof currentRaw === "string" ? currentRaw : "";
    const normalize = input.normalize ?? ((value: string) => value.trim());
    const currentNormalized = normalize(current);
    const incomingNormalized = normalize(trimmedIncoming);

    if (currentNormalized === incomingNormalized) {
      return;
    }

    if (!currentNormalized) {
      input.next[input.fieldPath] = trimmedIncoming;
      input.fieldMeta[key] = {
        source: input.source,
        sourceCvId: input.sourceCvId ?? null,
        ...this.buildExtractionMeta(input.extractionContext, key),
      };
      return;
    }

    if (
      input.source === "base_cv_ai_extraction" &&
      this.isLowConfidence(input.extractionContext, key)
    ) {
      return;
    }

    const isManuallyEdited = input.fieldMeta[key]?.manuallyEdited === true;
    if (isManuallyEdited && input.source !== "manual_edit") {
      this.pushSuggestionIfNeeded(input.suggestions, {
        fieldPath: key,
        currentValue: current,
        suggestedValue: trimmedIncoming,
        status: "pending",
        source: input.source,
        sourceCvId: input.sourceCvId ?? null,
        createdAt: input.nowIso,
      });
      return;
    }

    if (
      input.source === "base_cv_upload" ||
      input.source === "base_cv_ai_extraction" ||
      input.source === "manual_edit"
    ) {
      input.next[input.fieldPath] = trimmedIncoming;
      input.fieldMeta[key] = {
        source: input.source,
        sourceCvId: input.sourceCvId ?? null,
        ...this.buildExtractionMeta(input.extractionContext, key),
      };
    }
  }

  private isLowConfidence(
    extractionContext: { confidence?: Record<string, number> } | undefined,
    fieldPath: string,
  ): boolean {
    const score = extractionContext?.confidence?.[fieldPath];
    if (typeof score !== "number") {
      return false;
    }
    return score < 0.6;
  }

  private buildExtractionMeta(
    extractionContext:
      | {
          confidence?: Record<string, number>;
          extractedAt?: string;
        }
      | undefined,
    fieldPath: string,
  ): Pick<ProfileFieldMetaEntry, "sourceConfidence" | "sourceExtractedAt"> {
    const meta: Pick<
      ProfileFieldMetaEntry,
      "sourceConfidence" | "sourceExtractedAt"
    > = {};
    const confidence = extractionContext?.confidence?.[fieldPath];
    if (typeof confidence === "number") {
      meta.sourceConfidence = confidence;
    }
    if (typeof extractionContext?.extractedAt === "string") {
      meta.sourceExtractedAt = extractionContext.extractedAt;
    }
    return meta;
  }

  private mergeExperiences(input: {
    existing: CanonicalProfileData["experiences"];
    incoming: CanonicalProfileData["experiences"];
    source: MergeSource;
    sourceCvId?: string | null;
    fieldMeta: Record<string, ProfileFieldMetaEntry>;
    suggestions: ProfileSuggestion[];
    nowIso: string;
  }): CanonicalProfileData["experiences"] {
    const byId = new Map(
      input.existing.map((experience) => [experience.id, { ...experience }]),
    );

    for (const incomingExperience of input.incoming) {
      const currentExperience = byId.get(incomingExperience.id);
      if (!currentExperience) {
        byId.set(incomingExperience.id, { ...incomingExperience });
        continue;
      }

      for (const [field, rawValue] of Object.entries(incomingExperience)) {
        if (field === "id") {
          continue;
        }

        const fieldPath = `experiences.${incomingExperience.id}.${field}`;
        const currentValue =
          currentExperience[field as keyof typeof currentExperience];
        if (rawValue === undefined || rawValue === null) {
          continue;
        }

        if (typeof rawValue === "string" && !rawValue.trim()) {
          continue;
        }

        const currentComparable =
          typeof currentValue === "string" ? currentValue.trim() : currentValue;
        const incomingComparable =
          typeof rawValue === "string" ? rawValue.trim() : rawValue;

        if (currentComparable === incomingComparable) {
          continue;
        }

        const isManuallyEdited =
          input.fieldMeta[fieldPath]?.manuallyEdited === true;
        if (isManuallyEdited && input.source !== "manual_edit") {
          this.pushSuggestionIfNeeded(input.suggestions, {
            fieldPath,
            currentValue,
            suggestedValue: rawValue,
            status: "pending",
            source: input.source,
            sourceCvId: input.sourceCvId ?? null,
            createdAt: input.nowIso,
          });
          continue;
        }

        if (
          input.source === "base_cv_upload" ||
          input.source === "base_cv_ai_extraction" ||
          input.source === "manual_edit"
        ) {
          currentExperience[field as keyof typeof currentExperience] =
            incomingComparable as never;
          input.fieldMeta[fieldPath] = {
            source: input.source,
            sourceCvId: input.sourceCvId ?? null,
          };
        }
      }

      byId.set(incomingExperience.id, currentExperience);
    }

    return input.incoming
      .map((experience) => byId.get(experience.id) ?? experience)
      .concat(
        input.existing.filter(
          (experience) =>
            !input.incoming.some((item) => item.id === experience.id),
        ),
      );
  }

  private mergeSkillsBucket(existing: string[], incoming: string[]): string[] {
    const normalized = new Map<string, string>();

    for (const value of [...existing, ...incoming]) {
      const trimmed = value.trim();
      if (!trimmed) {
        continue;
      }
      normalized.set(trimmed.toLowerCase(), trimmed);
    }

    return [...normalized.values()];
  }

  private pushSuggestionIfNeeded(
    suggestions: ProfileSuggestion[],
    nextSuggestion: ProfileSuggestion,
  ) {
    const alreadyExists = suggestions.some(
      (suggestion) =>
        suggestion.status === "pending" &&
        suggestion.fieldPath === nextSuggestion.fieldPath &&
        suggestion.suggestedValue === nextSuggestion.suggestedValue &&
        suggestion.source === nextSuggestion.source,
    );

    if (alreadyExists) {
      return;
    }

    suggestions.push(nextSuggestion);
  }

  private normalizePhone(value: string): string {
    return value.replace(/\D/g, "");
  }

  private normalizeLinkedin(value: string): string {
    return value
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .replace(/\/$/, "");
  }
}
