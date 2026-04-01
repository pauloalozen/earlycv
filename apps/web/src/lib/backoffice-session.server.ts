import "server-only";

import { cookies } from "next/headers";

import { BACKOFFICE_SESSION_COOKIE_NAME } from "./backoffice-session";

export async function getBackofficeSessionToken() {
  const cookieStore = await cookies();
  const token = cookieStore.get(BACKOFFICE_SESSION_COOKIE_NAME)?.value?.trim();

  return token ? token : null;
}
