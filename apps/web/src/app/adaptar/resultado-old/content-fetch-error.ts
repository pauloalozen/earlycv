const FALLBACK_MESSAGE = "Não foi possível carregar essa análise agora.";

export function buildContentFetchErrorMessage(
  status: number,
  responseText: string,
): string {
  const detail = extractErrorDetail(responseText);
  const statusLabel = Number.isFinite(status) ? `[HTTP ${status}]` : "";

  return [FALLBACK_MESSAGE, statusLabel, detail].filter(Boolean).join(" ");
}

function extractErrorDetail(responseText: string): string {
  if (!responseText?.trim()) return "";

  try {
    const parsed = JSON.parse(responseText) as { message?: unknown };
    if (typeof parsed.message === "string" && parsed.message.trim()) {
      return parsed.message.trim();
    }
  } catch {
    // no-op, fallback to raw text
  }

  return responseText.trim();
}
