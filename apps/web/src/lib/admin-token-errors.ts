export function isInvalidAdminTokenError(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  return (
    error.message.startsWith("API 401:") || error.message.startsWith("API 403:")
  );
}
