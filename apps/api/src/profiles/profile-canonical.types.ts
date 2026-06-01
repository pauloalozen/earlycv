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
  headline?: string;
  professionalSummary?: string;
  experiences: ProfileExperience[];
  education: ProfileEducation[];
  skills: ProfileSkillsByBucket;
};
