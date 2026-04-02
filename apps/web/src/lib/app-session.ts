export const APP_ACCESS_TOKEN_COOKIE_NAME = "earlycv-access-token";
export const APP_REFRESH_TOKEN_COOKIE_NAME = "earlycv-refresh-token";

export type AppInternalRole = "none" | "admin" | "superadmin";

export type AppSessionUser = {
  email: string;
  emailVerifiedAt: string | null;
  id: string;
  internalRole: AppInternalRole;
  isStaff: boolean;
  name: string;
};

export function shouldMirrorBackofficeSession(user: AppSessionUser) {
  return Boolean(
    user.emailVerifiedAt && user.isStaff && user.internalRole !== "none",
  );
}

export function getDefaultAppRedirectPath(user: AppSessionUser | null) {
  if (!user) {
    return "/login";
  }

  if (!user.emailVerifiedAt) {
    return "/verificar-email";
  }

  if (user.isStaff && user.internalRole !== "none") {
    return "/admin";
  }

  return "/dashboard";
}

export function getRouteAccessRedirectPath(
  pathname: string,
  user: AppSessionUser | null,
) {
  const normalizedPath = pathname.startsWith("/") ? pathname : `/${pathname}`;

  if (normalizedPath === "/login") {
    return user ? getDefaultAppRedirectPath(user) : null;
  }

  if (!user) {
    return "/login";
  }

  if (!user.emailVerifiedAt) {
    return normalizedPath === "/verificar-email" ? null : "/verificar-email";
  }

  if (normalizedPath === "/verificar-email") {
    return getDefaultAppRedirectPath(user);
  }

  if (normalizedPath.startsWith("/superadmin")) {
    if (user.isStaff && user.internalRole === "superadmin") {
      return null;
    }

    return getDefaultAppRedirectPath(user);
  }

  if (normalizedPath.startsWith("/admin")) {
    if (user.isStaff && user.internalRole !== "none") {
      return null;
    }

    return getDefaultAppRedirectPath(user);
  }

  if (normalizedPath.startsWith("/dashboard")) {
    return null;
  }

  return null;
}
