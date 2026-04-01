import "server-only";

import type { InternalRole, UserPlanType, UserStatus } from "./admin-users-api";
import { getBackofficeSessionToken } from "./backoffice-session.server";

export type StaffUserRecord = {
  createdAt: string;
  email: string;
  emailVerifiedAt: string | null;
  id: string;
  internalRole: Exclude<InternalRole, "none">;
  isStaff: true;
  lastLoginAt: string | null;
  name: string;
  planType: UserPlanType;
  status: UserStatus;
  updatedAt: string;
};

export type CreateStaffUserPayload = {
  email: string;
  internalRole: Exclude<InternalRole, "none">;
  name: string;
  password: string;
};

export type UpdateStaffUserPayload = {
  email?: string;
  name?: string;
  status?: UserStatus;
};

export type UpdateStaffUserRolePayload = {
  internalRole: Exclude<InternalRole, "none">;
};

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

export async function listStaffUsers(token?: string) {
  return apiRequest<StaffUserRecord[]>("/superadmin/staff", token);
}

export async function createStaffUser(
  payload: CreateStaffUserPayload,
  token?: string,
) {
  return apiRequest<StaffUserRecord>("/superadmin/staff", token, {
    body: JSON.stringify(payload),
    headers: {
      "Content-Type": "application/json",
    },
    method: "POST",
  });
}

export async function updateStaffUser(
  userId: string,
  payload: UpdateStaffUserPayload,
  token?: string,
) {
  return apiRequest<StaffUserRecord>(`/superadmin/staff/${userId}`, token, {
    body: JSON.stringify(payload),
    headers: {
      "Content-Type": "application/json",
    },
    method: "PATCH",
  });
}

export async function updateStaffUserRole(
  userId: string,
  payload: UpdateStaffUserRolePayload,
  token?: string,
) {
  return apiRequest<StaffUserRecord>(
    `/superadmin/staff/${userId}/role`,
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
