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
  return plain || fallback;
}
