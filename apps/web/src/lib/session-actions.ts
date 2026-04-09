"use server";

import { getCurrentAppUserFromCookies } from "./app-session.server";

export async function getAuthStatus(): Promise<{
  isAuthenticated: boolean;
  userName: string | null;
}> {
  const user = await getCurrentAppUserFromCookies();
  return {
    isAuthenticated: Boolean(user),
    userName: user?.name ?? null,
  };
}
