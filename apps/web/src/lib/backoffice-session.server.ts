import "server-only";

import { cookies } from "next/headers";

import { getCurrentAppSession } from "./app-session.server";
import { BACKOFFICE_SESSION_COOKIE_NAME } from "./backoffice-session";

export async function getBackofficeSessionToken() {
  const session = await getCurrentAppSession();

  if (session?.user.isStaff && session.user.internalRole !== "none") {
    return session.accessToken;
  }

  const cookieStore = await cookies();
  const token = cookieStore.get(BACKOFFICE_SESSION_COOKIE_NAME)?.value?.trim();

  return token ? token : null;
}
