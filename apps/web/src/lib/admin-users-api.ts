import "server-only";

import { getBackofficeSessionToken } from "./backoffice-session.server";

export type UserPlanType = "free";

export type UserStatus = "active" | "pending" | "suspended" | "deleted";

export type InternalRole = "none" | "admin" | "superadmin";

export type ResumeStatus = "draft" | "uploaded" | "reviewed" | "failed";

export type ResumeKind = "master" | "adapted";

export type AdminUserProfileRecord = {
  city: string | null;
  country: string | null;
  headline: string | null;
};

export type AdminUserResumeRecord = {
  id: string;
  isMaster: boolean;
  kind: ResumeKind;
  status: ResumeStatus;
  title: string;
};

export type AdminUserRecord = {
  createdAt: string;
  email: string;
  emailVerifiedAt: string | null;
  id: string;
  internalRole: InternalRole;
  isStaff: boolean;
  lastLoginAt: string | null;
  name: string;
  planType: UserPlanType;
  profile: AdminUserProfileRecord | null;
  resumes: AdminUserResumeRecord[];
  status: UserStatus;
  updatedAt: string;
};

export type ResumeTemplateRecord = {
  createdAt: string;
  description: string | null;
  fileUrl: string | null;
  id: string;
  isActive: boolean;
  name: string;
  slug: string;
  structureJson: Record<string, unknown> | null;
  targetRole: string | null;
  updatedAt: string;
};

export type UpdateAdminUserPayload = {
  email?: string;
  name?: string;
};

export type UpdateAdminUserPlanPayload = {
  planType: UserPlanType;
};

export type UpdateAdminUserStatusPayload = {
  status: UserStatus;
};

export type StartAssistedSessionPayload = {
  reason: string;
};

export type AssistedSessionRecord = {
  banner: string;
  mode: "assisted";
  operatorUserId: string;
  reason: string;
  targetUserId: string;
};

export type CreateResumeTemplatePayload = {
  description?: string;
  fileUrl?: string;
  name: string;
  slug: string;
  structureJson?: Record<string, unknown>;
  targetRole?: string;
};

export type UpdateResumeTemplatePayload = Partial<CreateResumeTemplatePayload>;

function getApiBaseUrl() {
  const configuredBaseUrl =
    process.env.API_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    "http://localhost:4000";

  return configuredBaseUrl.endsWith("/api")
    ? configuredBaseUrl
    : `${configuredBaseUrl}/api`;
}

async function resolveToken(token?: string) {
  const sessionToken = token ?? (await getBackofficeSessionToken());

  if (!sessionToken) {
    throw new Error("Missing backoffice session token.");
  }

  return sessionToken;
}

async function apiRequest<T>(path: string, token?: string, init?: RequestInit) {
  const bearerToken = await resolveToken(token);

  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${bearerToken}`,
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    throw new Error(`API ${response.status}: ${await response.text()}`);
  }

  return (await response.json()) as T;
}

export async function listAdminUsers(token?: string) {
  return apiRequest<AdminUserRecord[]>("/admin/users", token);
}

export async function getAdminUser(userId: string, token?: string) {
  return apiRequest<AdminUserRecord>(`/admin/users/${userId}`, token);
}

export async function updateAdminUser(
  userId: string,
  payload: UpdateAdminUserPayload,
  token?: string,
) {
  return apiRequest<AdminUserRecord>(`/admin/users/${userId}`, token, {
    body: JSON.stringify(payload),
    headers: {
      "Content-Type": "application/json",
    },
    method: "PATCH",
  });
}

export async function updateAdminUserPlan(
  userId: string,
  payload: UpdateAdminUserPlanPayload,
  token?: string,
) {
  return apiRequest<AdminUserRecord>(`/admin/users/${userId}/plan`, token, {
    body: JSON.stringify(payload),
    headers: {
      "Content-Type": "application/json",
    },
    method: "PATCH",
  });
}

export async function updateAdminUserStatus(
  userId: string,
  payload: UpdateAdminUserStatusPayload,
  token?: string,
) {
  return apiRequest<AdminUserRecord>(`/admin/users/${userId}/status`, token, {
    body: JSON.stringify(payload),
    headers: {
      "Content-Type": "application/json",
    },
    method: "PATCH",
  });
}

export async function startAssistedSession(
  userId: string,
  payload: StartAssistedSessionPayload,
  token?: string,
) {
  return apiRequest<AssistedSessionRecord>(
    `/admin/users/${userId}/assisted-session`,
    token,
    {
      body: JSON.stringify(payload),
      headers: {
        "Content-Type": "application/json",
      },
      method: "POST",
    },
  );
}

export async function listResumeTemplates(token?: string) {
  return apiRequest<ResumeTemplateRecord[]>("/admin/resume-templates", token);
}

export async function createResumeTemplate(
  payload: CreateResumeTemplatePayload,
  token?: string,
) {
  return apiRequest<ResumeTemplateRecord>("/admin/resume-templates", token, {
    body: JSON.stringify(payload),
    headers: {
      "Content-Type": "application/json",
    },
    method: "POST",
  });
}

export async function updateResumeTemplate(
  templateId: string,
  payload: UpdateResumeTemplatePayload,
  token?: string,
) {
  return apiRequest<ResumeTemplateRecord>(
    `/admin/resume-templates/${templateId}`,
    token,
    {
      body: JSON.stringify(payload),
      headers: {
        "Content-Type": "application/json",
      },
      method: "PATCH",
    },
  );
}

export async function toggleResumeTemplateStatus(
  templateId: string,
  token?: string,
) {
  return apiRequest<ResumeTemplateRecord>(
    `/admin/resume-templates/${templateId}/toggle-status`,
    token,
    {
      method: "POST",
    },
  );
}
