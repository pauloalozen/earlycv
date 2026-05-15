export function extractApiErrorMessage(raw: string, fallback: string): string {
  try {
    const parsed = JSON.parse(raw) as { message?: string | string[] };

    if (Array.isArray(parsed.message)) {
      return parsed.message.join(" | ");
    }

    if (typeof parsed.message === "string" && parsed.message.trim()) {
      return parsed.message.trim();
    }
  } catch {}

  const plain = raw.trim();

  const lower = plain.toLowerCase();
  const looksLikeHtmlDocument =
    lower.startsWith("<!doctype html") || lower.startsWith("<html");
  const looksLikeCloudflareChallenge =
    lower.includes("just a moment") ||
    lower.includes("challenges.cloudflare.com") ||
    lower.includes("cf_chl_opt") ||
    lower.includes("enable javascript and cookies to continue");

  if (looksLikeHtmlDocument || looksLikeCloudflareChallenge) {
    return fallback;
  }

  return plain || fallback;
}
