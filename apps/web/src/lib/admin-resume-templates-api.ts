"use server";

import { apiRequest } from "./api-request";

export type AdminResumeTemplateDto = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  targetRole: string | null;
  fileUrl: string | null;
  structureJson: Record<string, unknown> | null;
  status: string;
  createdAt: string;
  updatedAt: string;
};

export async function adminListResumeTemplates(): Promise<
  AdminResumeTemplateDto[]
> {
  const response = await apiRequest("GET", "/admin/resume-templates");
  if (!response.ok) {
    throw new Error("Failed to fetch templates");
  }
  return response.json() as Promise<AdminResumeTemplateDto[]>;
}

export async function adminCreateResumeTemplate(data: {
  name: string;
  slug: string;
  description?: string;
  targetRole?: string;
  fileUrl?: string;
}): Promise<AdminResumeTemplateDto> {
  const response = await apiRequest("POST", "/admin/resume-templates", data);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to create template: ${text}`);
  }
  return response.json() as Promise<AdminResumeTemplateDto>;
}

export async function adminUpdateResumeTemplate(
  id: string,
  data: {
    name?: string;
    slug?: string;
    description?: string;
    targetRole?: string;
    fileUrl?: string;
  },
): Promise<AdminResumeTemplateDto> {
  const response = await apiRequest(
    "PATCH",
    `/admin/resume-templates/${id}`,
    data,
  );
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to update template: ${text}`);
  }
  return response.json() as Promise<AdminResumeTemplateDto>;
}

export async function adminToggleResumeTemplateStatus(
  id: string,
): Promise<AdminResumeTemplateDto> {
  const response = await apiRequest(
    "POST",
    `/admin/resume-templates/${id}/toggle-status`,
  );
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to toggle template status: ${text}`);
  }
  return response.json() as Promise<AdminResumeTemplateDto>;
}
