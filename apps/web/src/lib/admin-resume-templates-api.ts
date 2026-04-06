import "server-only";

import { getBackofficeSessionToken } from "./backoffice-session.server";

export type AdminResumeTemplateDto = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  targetRole: string | null;
  fileUrl: string | null;
  structureJson: Record<string, unknown> | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

function getApiBaseUrl() {
  const base =
    process.env.API_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    "http://localhost:4000";

  return base.endsWith("/api") ? base : `${base}/api`;
}

async function getToken() {
  const token = await getBackofficeSessionToken();
  if (!token) {
    throw new Error("Missing backoffice session token.");
  }
  return token;
}

async function adminApiRequest(
  method: string,
  path: string,
  body?: FormData | Record<string, unknown>,
): Promise<Response> {
  const token = await getToken();
  const url = `${getApiBaseUrl()}${path}`;

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
  };

  if (body && !(body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }

  const options: RequestInit = {
    method,
    headers,
    cache: "no-store",
  };

  if (body) {
    options.body = body instanceof FormData ? body : JSON.stringify(body);
  }

  return fetch(url, options);
}

export async function adminListResumeTemplates(): Promise<
  AdminResumeTemplateDto[]
> {
  const response = await adminApiRequest("GET", "/admin/resume-templates");
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
}): Promise<AdminResumeTemplateDto> {
  const response = await adminApiRequest(
    "POST",
    "/admin/resume-templates",
    data,
  );
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
  },
): Promise<AdminResumeTemplateDto> {
  const response = await adminApiRequest(
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
  const response = await adminApiRequest(
    "POST",
    `/admin/resume-templates/${id}/toggle-status`,
  );
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to toggle template status: ${text}`);
  }
  return response.json() as Promise<AdminResumeTemplateDto>;
}

export async function adminUploadResumeTemplateFile(
  id: string,
  file: File,
): Promise<AdminResumeTemplateDto> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await adminApiRequest(
    "POST",
    `/admin/resume-templates/${id}/upload-file`,
    formData,
  );
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to upload template file: ${text}`);
  }
  return response.json() as Promise<AdminResumeTemplateDto>;
}
