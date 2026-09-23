// Mensagens genéricas de erro HTTP (corpo default de exceções não tratadas
// do NestJS, ex.: `{"statusCode":500,"message":"Internal Server Error"}`)
// nunca devem chegar cruas ao usuário — achado real (2026-09-22, upload de
// CV no radar): um erro de storage sem tratamento específico no backend
// vazava literalmente "Internal Server Error" pra caixa de upload, porque
// esse texto é JSON válido com `message` string e passava incólume por
// este filtro (só HTML/Cloudflare eram sanitizados até então).
const GENERIC_SERVER_ERROR_MARKERS = [
  "internal server error",
  "service unavailable",
  "bad gateway",
  "gateway timeout",
];

export function extractApiErrorMessage(raw: string, fallback: string): string {
  try {
    const parsed = JSON.parse(raw) as { message?: string | string[] };

    if (Array.isArray(parsed.message)) {
      return parsed.message.join(" | ");
    }

    if (typeof parsed.message === "string" && parsed.message.trim()) {
      const normalized = parsed.message.trim();
      if (GENERIC_SERVER_ERROR_MARKERS.includes(normalized.toLowerCase())) {
        return fallback;
      }
      return normalized;
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

// Filtro pra mensagens de erro gravadas cruas em campos de domínio
// (AnalysisJob.lastError / CvProcessingJob.lastError) — nunca vêm de um
// corpo JSON de resposta HTTP (por isso não reusa extractApiErrorMessage
// acima), mas têm o mesmo risco: podem ser texto técnico direto de uma
// exceção (SDK do S3, Prisma, stack trace), nunca pensado pra aparecer pro
// usuário. Toda mensagem de domínio legítima escrita pelo time é em
// português (ex.: "O texto informado não parece uma descrição de vaga...")
// — por isso o heurístico de "parece técnico" usa vocabulário técnico em
// inglês, que não colide com mensagens de domínio reais.
const TECHNICAL_ERROR_PATTERN =
  /error|exception|errno|econnrefused|traceback|stack trace|storage backend|\bat\s+\S+\s*\(/i;
const MAX_DOMAIN_ERROR_LENGTH = 300;

export function sanitizeDomainErrorMessage(
  raw: string | null | undefined,
  fallback: string,
): string {
  if (!raw) return fallback;
  const plain = raw.trim();
  if (!plain) return fallback;
  if (GENERIC_SERVER_ERROR_MARKERS.includes(plain.toLowerCase())) {
    return fallback;
  }
  if (plain.length > MAX_DOMAIN_ERROR_LENGTH) {
    return fallback;
  }
  if (TECHNICAL_ERROR_PATTERN.test(plain)) {
    return fallback;
  }
  return plain;
}
