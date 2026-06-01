import { Injectable } from "@nestjs/common";

import type {
  CanonicalProfileData,
  ProfileFieldMetaEntry,
  ProfileSuggestion,
} from "./profile-canonical.types";

type MergeSource = "analysis_upload" | "base_cv_upload" | "manual_edit";

type MergeInput = {
  existing: Partial<CanonicalProfileData>;
  incoming: Partial<CanonicalProfileData>;
  source: MergeSource;
  sourceCvId?: string | null;
  fieldMeta?: Record<string, ProfileFieldMetaEntry>;
  suggestions?: ProfileSuggestion[];
};

type MergeResult = {
  next: Partial<CanonicalProfileData>;
  fieldMeta: Record<string, ProfileFieldMetaEntry>;
  suggestions: ProfileSuggestion[];
};

@Injectable()
export class ProfileCanonicalMergeService {
  merge(input: MergeInput): MergeResult {
    const nowIso = new Date().toISOString();
    const next: Partial<CanonicalProfileData> = {
      ...input.existing,
      experiences: input.existing.experiences ?? [],
      education: input.existing.education ?? [],
      skills: input.existing.skills ?? { technical: [], business: [], soft: [] },
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
    });

    if (input.incoming.experiences) {
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

    if (input.incoming.skills) {
      const mergedSkills = {
        technical: this.mergeSkillsBucket(
          next.skills?.technical ?? [],
          input.incoming.skills.technical ?? [],
        ),
        business: this.mergeSkillsBucket(
          next.skills?.business ?? [],
          input.incoming.skills.business ?? [],
        ),
        soft: this.mergeSkillsBucket(
          next.skills?.soft ?? [],
          input.incoming.skills.soft ?? [],
        ),
      };

      next.skills = mergedSkills;
    }

    return { next, fieldMeta, suggestions };
  }

  private mergeScalar(input: {
    fieldPath: keyof CanonicalProfileData;
    next: Partial<CanonicalProfileData>;
    incoming: string | undefined;
    source: MergeSource;
    sourceCvId?: string | null;
    fieldMeta: Record<string, ProfileFieldMetaEntry>;
    suggestions: ProfileSuggestion[];
    nowIso: string;
    normalize?: (value: string) => string;
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
      };
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

    if (input.source === "base_cv_upload" || input.source === "manual_edit") {
      input.next[input.fieldPath] = trimmedIncoming;
      input.fieldMeta[key] = {
        source: input.source,
        sourceCvId: input.sourceCvId ?? null,
      };
    }
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
        const currentValue = currentExperience[field as keyof typeof currentExperience];
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

        if (input.source === "base_cv_upload" || input.source === "manual_edit") {
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
          (experience) => !input.incoming.some((item) => item.id === experience.id),
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
