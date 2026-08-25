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

export function validateCvTextInput(input: string): string | null {
  const normalized = input.trim();
  if (!normalized) {
    return "Digite o texto do seu CV.";
  }

  if (normalized.length < 120) {
    return "O texto do CV está muito curto. Inclua mais detalhes antes de analisar.";
  }

  const nonEmptyLines = normalized
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (nonEmptyLines.length < 3) {
    return "Organize o CV em mais linhas (resumo, experiências e competências, por exemplo).";
  }

  const hasCommonCvSection =
    /(experi[eê]ncia|forma[cç][aã]o|habilidades|compet[eê]ncias|resumo|projetos|idiomas|certifica[cç][oõ]es)/i.test(
      normalized,
    );
  const hasDateSignal = /\b(19|20)\d{2}\b/.test(normalized);

  if (!hasCommonCvSection && !hasDateSignal) {
    return "Esse texto não parece ser um currículo. Inclua seções como experiência, formação ou competências.";
  }

  return null;
}
