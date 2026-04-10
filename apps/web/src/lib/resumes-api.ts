"use server";

import { apiRequest } from "./api-request";
import { getMasterResumeFromList as selectMasterResumeFromList } from "./resumes-selectors";

type ResumeDto = {
  id: string;
  title: string;
  sourceFileName: string | null;
  isMaster: boolean;
  updatedAt: string;
};

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
  const resumes = await listMyResumes();
  return getMasterResumeFromList(resumes);
}
