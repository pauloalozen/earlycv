"use server";

import { apiRequest } from "./api-request";

export type RadarProfileDto = {
  userId: string;
  areas: string[];
  seniority: string;
  skills: string[];
  technologies: string[];
  languages: string[];
  certifications: string[];
  careerFingerprint: string[];
  preferredWorkModels: string[];
  preferredContractTypes: string[];
  openToRelocation: boolean;
  salaryExpectationMin: number | null;
};

export type JobMatchScoreDto = {
  score: number | null;
  breakdown: {
    area: number;
    skills: number;
    seniority: number;
    technologies: number;
    language: number;
    workModel: number;
  } | null;
  matchedSkills: string[];
  missingSkills: string[];
};

export async function getMyRadarProfile(): Promise<RadarProfileDto | null> {
  try {
    const response = await apiRequest("GET", "/radar/profile");
    if (!response.ok) return null;
    const body = (await response.json()) as RadarProfileDto | null;
    return body ?? null;
  } catch {
    return null;
  }
}

export async function getJobMatchScore(
  slug: string,
): Promise<JobMatchScoreDto | null> {
  try {
    const response = await apiRequest("GET", `/public/jobs/${slug}/score`);
    if (!response.ok) return null;
    return (await response.json()) as JobMatchScoreDto;
  } catch {
    return null;
  }
}
