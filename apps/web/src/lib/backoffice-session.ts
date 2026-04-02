export const BACKOFFICE_SESSION_COOKIE_NAME = "earlycv-backoffice-session";

export function buildBackofficeSessionResetHref(nextPath: string) {
  return `/backoffice/session/reset?next=${encodeURIComponent(nextPath)}`;
}

export function buildBackofficeBootstrapRedirectUrl(requestUrl: string) {
  const url = new URL(requestUrl);

  url.searchParams.delete("token");

  const query = url.searchParams.toString();

  return `${url.pathname}${query ? `?${query}` : ""}${url.hash}`;
}
