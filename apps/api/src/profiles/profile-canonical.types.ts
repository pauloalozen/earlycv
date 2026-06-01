export type ProfileFieldPath = string;

export type ProfileExperience = {
  id: string;
  company?: string;
  role?: string;
  startDate?: string;
  endDate?: string;
  isCurrent?: boolean;
  description?: string;
  achievements?: string[];
  relatedSkills?: string[];
};

export type ProfileEducation = {
  id: string;
  institution?: string;
  degree?: string;
  fieldOfStudy?: string;
  startDate?: string;
  endDate?: string;
  description?: string;
};

export type ProfileSkillsByBucket = {
  technical: string[];
  business: string[];
  soft: string[];
};

export type CanonicalProfileData = {
  fullName?: string;
  phone?: string;
  linkedinUrl?: string;
  headline?: string;
  professionalSummary?: string;
  experiences: ProfileExperience[];
  education: ProfileEducation[];
  skills: ProfileSkillsByBucket;
};

export type ProfileFieldMetaEntry = {
  source: "analysis_upload" | "base_cv_upload" | "manual_edit";
  manuallyEdited?: boolean;
  lastEditedAt?: string;
  sourceCvId?: string | null;
};

export type ProfileSuggestionStatus = "pending" | "accepted" | "rejected";

export type ProfileSuggestion = {
  fieldPath: ProfileFieldPath;
  currentValue: unknown;
  suggestedValue: unknown;
  status: ProfileSuggestionStatus;
  source: "analysis_upload" | "base_cv_upload" | "manual_edit";
  sourceCvId?: string | null;
  createdAt: string;
};
