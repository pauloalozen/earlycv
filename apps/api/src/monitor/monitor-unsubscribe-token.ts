import { createHmac, timingSafeEqual } from "node:crypto";

// Token de descadastro do digest do Monitor — assinado (HMAC-SHA256),
// sem expiração de propósito: um e-mail antigo continua tendo um link de
// unsubscribe funcional (não faz sentido "expirar" o direito de parar de
// receber e-mail). Não carrega nada além do userId — sem PII (nome,
// e-mail) na URL, conforme exigido pela spec da Fase 3. Verificação nunca
// exige login: quem tem o link do e-mail pode descadastrar aquele e-mail,
// mesmo sem sessão ativa no browser.
const TOKEN_VERSION = "v1";

function base64UrlEncode(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function base64UrlDecode(input: string): Buffer {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/");
  const padding =
    padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  return Buffer.from(padded + padding, "base64");
}

function getSecret(): string {
  const secret = process.env.MONITOR_DIGEST_UNSUBSCRIBE_SECRET;
  if (!secret) {
    throw new Error(
      "MONITOR_DIGEST_UNSUBSCRIBE_SECRET is not configured — cannot sign/verify monitor digest unsubscribe tokens",
    );
  }
  return secret;
}

function sign(payload: string, secret: string): string {
  return base64UrlEncode(createHmac("sha256", secret).update(payload).digest());
}

export function createMonitorUnsubscribeToken(userId: string): string {
  const payload = `${TOKEN_VERSION}.${userId}`;
  const encodedPayload = base64UrlEncode(payload);
  const signature = sign(encodedPayload, getSecret());
  return `${encodedPayload}.${signature}`;
}

// Retorna o userId quando o token é válido (assinatura confere e o
// formato/versão são os esperados); null em qualquer outro caso — nunca
// lança, para o caller sempre poder tratar "link inválido" como um estado
// normal de UI, não um erro de servidor.
export function verifyMonitorUnsubscribeToken(token: string): string | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [encodedPayload, signature] = parts;

  let secret: string;
  try {
    secret = getSecret();
  } catch {
    return null;
  }

  const expectedSignature = sign(encodedPayload, secret);
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);
  if (
    signatureBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(signatureBuffer, expectedBuffer)
  ) {
    return null;
  }

  let payload: string;
  try {
    payload = base64UrlDecode(encodedPayload).toString("utf8");
  } catch {
    return null;
  }

  const [version, userId] = payload.split(".");
  if (version !== TOKEN_VERSION || !userId) return null;

  return userId;
}
