"use server";

import { apiRequest } from "./api-request";

export type ResumeTemplateDto = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  targetRole: string | null;
  previewImageUrl: string | null;
  fileUrl: string | null;
};

export async function listResumeTemplates(): Promise<ResumeTemplateDto[]> {
  const response = await apiRequest("GET", "/resume-templates");
  if (!response.ok) {
    throw new Error("Failed to fetch templates");
  }
  return response.json() as Promise<ResumeTemplateDto[]>;
}
