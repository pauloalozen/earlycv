import "server-only";

import { cookies } from "next/headers";

import { fetchCurrentAppUser, getAppSessionTokens } from "./app-session.server";
import { BACKOFFICE_SESSION_COOKIE_NAME } from "./backoffice-session";

export async function getBackofficeSessionToken() {
  const { accessToken } = await getAppSessionTokens();

  if (accessToken) {
    const user = await fetchCurrentAppUser(accessToken);

    if (user?.isStaff && user.internalRole !== "none") {
      return accessToken;
    }
  }

  const cookieStore = await cookies();
  const token = cookieStore.get(BACKOFFICE_SESSION_COOKIE_NAME)?.value?.trim();

  return token ? token : null;
}
