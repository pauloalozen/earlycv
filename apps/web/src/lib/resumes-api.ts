"use server";

import { apiRequest } from "./api-request";
import { getMasterResumeFromList as selectMasterResumeFromList } from "./resumes-selectors";

export type ResumeDto = {
  id: string;
  title: string;
  sourceFileName: string | null;
  isMaster: boolean;
  updatedAt: string;
};

export type MasterCvExtractionStatusDto = {
  status: "pending" | "processing" | "succeeded" | "failed";
  extractionCoverage: {
    identifiedFields: string[];
    missingFields: string[];
    fieldStatus: Record<string, "filled" | "partial" | "missing">;
  } | null;
  updatedAt: string;
} | null;

export async function listMyResumes(): Promise<ResumeDto[]> {
  const response = await apiRequest("GET", "/resumes");
  if (!response.ok) {
    throw new Error("Failed to list resumes");
  }
  return response.json() as Promise<ResumeDto[]>;
}

export async function getMasterResumeFromList(
  resumes: ResumeDto[],
): Promise<ResumeDto | null> {
  return selectMasterResumeFromList(resumes);
}

export async function getMyMasterResume(): Promise<ResumeDto | null> {
  try {
    const resumes = await listMyResumes();
    return getMasterResumeFromList(resumes);
  } catch {
    return null;
  }
}

export async function uploadMasterResume(
  formData: FormData,
): Promise<ResumeDto> {
  const response = await apiRequest("POST", "/resumes", formData);
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to upload resume: ${error}`);
  }
  return response.json() as Promise<ResumeDto>;
}

export async function deleteMasterResume(id: string): Promise<void> {
  const response = await apiRequest("DELETE", `/resumes/${id}`);
  if (!response.ok) {
    throw new Error("Failed to delete resume");
  }
}

export async function getMyMasterCvExtractionStatus(): Promise<MasterCvExtractionStatusDto> {
  try {
    const response = await apiRequest(
      "GET",
      "/resumes/master-cv-extraction-status",
    );
    if (!response.ok) {
      return null;
    }
    const payload = await response.text();
    if (!payload.trim()) {
      return null;
    }
    return JSON.parse(payload) as MasterCvExtractionStatusDto;
  } catch {
    return null;
  }
}
