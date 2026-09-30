export type AdminDataErrorKind =
  | "invalid-token"
  | "missing-role"
  | "unexpected-error";

export function isInvalidAdminTokenError(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  return error.message.startsWith("API 401:");
}

export function isMissingAdminRoleError(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  return error.message.startsWith("API 403:");
}

export function getAdminDataErrorKind(error: unknown): AdminDataErrorKind {
  if (isInvalidAdminTokenError(error)) {
    return "invalid-token";
  }

  if (isMissingAdminRoleError(error)) {
    return "missing-role";
  }

  return "unexpected-error";
}

// A API responde 404 como Error("API 404: ...") nos clientes do admin.
export function isApiNotFoundError(error: unknown) {
  return error instanceof Error && error.message.startsWith("API 404:");
}
