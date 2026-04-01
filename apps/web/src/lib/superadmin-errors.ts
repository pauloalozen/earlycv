type NextNotFoundLikeError = {
  digest?: string;
};

export type SuperadminDataErrorKind = "invalid-token" | "unexpected-error";

export function isInvalidSuperadminTokenError(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  return (
    error.message.startsWith("API 401:") || error.message.startsWith("API 403:")
  );
}

export function getSuperadminDataErrorKind(
  error: unknown,
): SuperadminDataErrorKind {
  return isInvalidSuperadminTokenError(error)
    ? "invalid-token"
    : "unexpected-error";
}

export function isNextNotFoundError(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  return (
    (error as NextNotFoundLikeError).digest === "NEXT_HTTP_ERROR_FALLBACK;404"
  );
}
