import { createHmac, timingSafeEqual } from "node:crypto";

// DECISÃO (revisada na Fase 3.1): o pacote oficial `resend` NÃO está
// instalado neste monorepo — `npm ls resend` não acha nada em nenhum
// workspace. O projeto inteiro já fala com o Resend via `fetch` cru
// direto pra API HTTP (ver ResendEmailDeliveryService e, antes dele,
// payment-recovery-email.service.ts) — nunca usou o SDK oficial, em
// nenhuma feature. Adicionar `resend` agora só pra usar
// `resend.webhooks.verify()` trocaria ~30 linhas de crypto padrão,
// documentada e testada, por uma dependência nova de supply-chain, só
// pra esse helper — sem ganho funcional (o algoritmo abaixo já é
// exatamente o documentado pelo Svix, que é quem o Resend usa por baixo
// pra entregar webhooks: https://docs.svix.com/receiving/verifying-payloads/how-manual).
// Se o projeto adotar o SDK oficial do Resend por outro motivo no
// futuro (ex.: passar a usar mais funcionalidades dele), faz sentido
// revisitar e trocar isto por `resend.webhooks.verify()`.
const TOLERANCE_MS = 5 * 60_000;

export type ResendWebhookHeaders = {
  svixId: string | undefined;
  svixTimestamp: string | undefined;
  svixSignature: string | undefined;
};

function decodeSecret(secret: string): Buffer {
  const withoutPrefix = secret.startsWith("whsec_")
    ? secret.slice("whsec_".length)
    : secret;
  return Buffer.from(withoutPrefix, "base64");
}

// rawBody precisa ser os bytes EXATOS recebidos (Buffer) — reserializar o
// JSON já parseado quase sempre produz uma string diferente byte a byte
// (ordem de chaves, espaçamento) e faz a verificação falhar mesmo com um
// payload legítimo.
export function verifyResendWebhookSignature(
  rawBody: Buffer,
  headers: ResendWebhookHeaders,
  secret: string,
): boolean {
  const { svixId, svixTimestamp, svixSignature } = headers;
  if (!svixId || !svixTimestamp || !svixSignature) {
    return false;
  }

  const timestampMs = Number(svixTimestamp) * 1000;
  if (
    !Number.isFinite(timestampMs) ||
    Math.abs(Date.now() - timestampMs) > TOLERANCE_MS
  ) {
    return false;
  }

  const signedContent = `${svixId}.${svixTimestamp}.${rawBody.toString("utf8")}`;
  const expected = createHmac("sha256", decodeSecret(secret))
    .update(signedContent)
    .digest();

  // svix-signature pode trazer várias assinaturas espaço-separadas
  // ("v1,<sig> v1,<sig2>", uma por secret ativo durante rotação) — válido
  // se QUALQUER uma bater.
  const candidates = svixSignature
    .split(" ")
    .map((entry) => entry.split(",")[1])
    .filter((value): value is string => Boolean(value));

  return candidates.some((candidate) => {
    let candidateBuffer: Buffer;
    try {
      candidateBuffer = Buffer.from(candidate, "base64");
    } catch {
      return false;
    }
    return (
      candidateBuffer.length === expected.length &&
      timingSafeEqual(candidateBuffer, expected)
    );
  });
}
