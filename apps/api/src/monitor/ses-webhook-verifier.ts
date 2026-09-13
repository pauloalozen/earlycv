import type { KeyObject } from "node:crypto";
import { createVerify, X509Certificate } from "node:crypto";

// Verificação manual de assinatura de mensagens SNS (mesmo raciocínio de
// resend-webhook-verifier.ts: o algoritmo é público, documentado pela AWS,
// e reimplementá-lo evita puxar um SDK inteiro só por isto). Diferente do
// HMAC do Svix, este é assinatura RSA sobre um certificado X.509 que a
// própria SNS hospeda e serve — o que introduz uma superfície real de SSRF
// se o hostname do certificado não for validado ANTES de qualquer fetch.
//
// Camadas de defesa, nesta ordem, cada uma independente das outras:
//   1. SigningCertURL precisa ser https e apontar pro domínio oficial da
//      AWS pra SNS (nunca fazer fetch de qualquer URL recebida no payload).
//   2. TopicArn precisa bater com AWS_SES_SNS_TOPIC_ARN configurado — uma
//      assinatura válida só prova "assinado por ALGUM tópico SNS da AWS",
//      nunca "assinado pelo MEU tópico" (checado pelo chamador, ver
//      monitor-public.controller.ts).
//   3. A assinatura em si, verificada com a chave pública extraída do
//      certificado.
// As três precisam passar — nenhuma sozinha basta.
const TRUSTED_SNS_CERT_HOST = /^sns\.[a-z0-9-]+\.amazonaws\.com(\.cn)?$/i;
const CERT_FETCH_TIMEOUT_MS = 5_000;

// Cache pequeno em memória — o certificado de assinatura é reutilizado por
// muitas mensagens seguidas (mesma região/partição), evitar refetch a cada
// evento é só uma otimização, nunca uma dependência de segurança (a
// verificação de hostname e a verificação de assinatura acontecem sempre,
// cache ou não).
const certCache = new Map<string, string>();

export type SnsMessage = {
  Type: string;
  MessageId: string;
  TopicArn: string;
  Subject?: string;
  Message: string;
  Timestamp: string;
  SignatureVersion: string;
  Signature: string;
  SigningCertURL: string;
  SubscribeURL?: string;
  Token?: string;
};

export function isTrustedSnsCertUrl(rawUrl: string): boolean {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return false;
  }
  return url.protocol === "https:" && TRUSTED_SNS_CERT_HOST.test(url.hostname);
}

// Exportado só para teste — a verificação real sempre passa por
// verifySnsMessageSignature, que aplica a checagem de hostname ANTES de
// chegar aqui.
export function buildStringToSign(message: SnsMessage): string {
  // Ordem de campos EXATA definida pela AWS — difere entre Notification e
  // SubscriptionConfirmation/UnsubscribeConfirmation. Subject só entra se
  // presente (Notification sem Subject não inclui a linha).
  const fields: Array<[string, string | undefined]> =
    message.Type === "Notification"
      ? [
          ["Message", message.Message],
          ["MessageId", message.MessageId],
          ["Subject", message.Subject],
          ["Timestamp", message.Timestamp],
          ["TopicArn", message.TopicArn],
          ["Type", message.Type],
        ]
      : [
          ["Message", message.Message],
          ["MessageId", message.MessageId],
          ["SubscribeURL", message.SubscribeURL],
          ["Timestamp", message.Timestamp],
          ["Token", message.Token],
          ["TopicArn", message.TopicArn],
          ["Type", message.Type],
        ];

  return fields
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}\n${value}\n`)
    .join("");
}

async function fetchTrustedCertPem(certUrl: string): Promise<string> {
  const cached = certCache.get(certUrl);
  if (cached) {
    return cached;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CERT_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(certUrl, { signal: controller.signal });
    if (!res.ok) {
      throw new Error(
        `failed to fetch SNS signing certificate: HTTP ${res.status}`,
      );
    }
    const pem = await res.text();
    certCache.set(certUrl, pem);
    return pem;
  } finally {
    clearTimeout(timeout);
  }
}

// Exportado só para teste — evita ter que mockar `fetch` global pra testar
// a lógica de verificação de assinatura em si. Não faz nenhuma checagem de
// hostname sozinho: quem chama isto diretamente é responsável por já ter
// validado a origem do PEM.
export function verifySignatureWithPem(
  message: Pick<SnsMessage, "SignatureVersion" | "Signature" | "Type"> &
    Partial<SnsMessage>,
  pem: string,
): boolean {
  if (message.SignatureVersion !== "1" && message.SignatureVersion !== "2") {
    return false;
  }
  if (!message.Signature) {
    return false;
  }

  let publicKey: KeyObject;
  try {
    publicKey = new X509Certificate(pem).publicKey;
  } catch {
    return false;
  }

  const algorithm =
    message.SignatureVersion === "2" ? "RSA-SHA256" : "RSA-SHA1";
  const stringToSign = buildStringToSign(message as SnsMessage);

  try {
    const verifier = createVerify(algorithm);
    verifier.update(stringToSign, "utf8");
    verifier.end();
    return verifier.verify(publicKey, message.Signature, "base64");
  } catch {
    return false;
  }
}

export async function verifySnsMessageSignature(
  message: SnsMessage,
): Promise<boolean> {
  if (!isTrustedSnsCertUrl(message.SigningCertURL)) {
    return false;
  }

  let pem: string;
  try {
    pem = await fetchTrustedCertPem(message.SigningCertURL);
  } catch {
    return false;
  }

  return verifySignatureWithPem(message, pem);
}
