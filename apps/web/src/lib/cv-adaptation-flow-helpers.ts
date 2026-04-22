export function appendTurnstileTokenToAnalyzeFormData(
  formData: FormData,
  turnstileToken?: string | null,
): FormData {
  const normalizedToken =
    typeof turnstileToken === "string" ? turnstileToken.trim() : "";

  if (normalizedToken) {
    formData.set("turnstileToken", normalizedToken);
  }

  return formData;
}

export function buildFunnelEventIdempotencyKey(payload: {
  flowSessionId: string;
  attemptId: string;
  eventName: string;
}): string {
  return `${payload.flowSessionId}:${payload.attemptId}:${payload.eventName}`;
}
