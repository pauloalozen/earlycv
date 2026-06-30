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

export type ProfileLanguage = {
  language: string;
  level?: string;
};

export type ProfileCertification = {
  name: string;
  issuer?: string;
  year?: string;
};

export type CanonicalProfileData = {
  fullName?: string;
  contactEmail?: string;
  phone?: string;
  linkedinUrl?: string;
  city?: string;
  state?: string;
  country?: string;
  headline?: string;
  professionalSummary?: string;
  experiences: ProfileExperience[];
  education: ProfileEducation[];
  skills: ProfileSkillsByBucket;
  languages: ProfileLanguage[];
  certifications: ProfileCertification[];
};

export type ProfileFieldMetaEntry = {
  source:
    | "analysis_upload"
    | "base_cv_upload"
    | "base_cv_ai_extraction"
    | "manual_edit";
  manuallyEdited?: boolean;
  lastEditedAt?: string;
  sourceCvId?: string | null;
  sourceConfidence?: number;
  sourceExtractedAt?: string;
};

export type ProfileSuggestionStatus = "pending" | "accepted" | "rejected";

export type ProfileSuggestion = {
  fieldPath: ProfileFieldPath;
  currentValue: unknown;
  suggestedValue: unknown;
  status: ProfileSuggestionStatus;
  source:
    | "analysis_upload"
    | "base_cv_upload"
    | "base_cv_ai_extraction"
    | "manual_edit";
  sourceCvId?: string | null;
  createdAt: string;
};
