import { createHash, timingSafeEqual } from "node:crypto";

// Primitivo puro, sem dependência de módulo/DB — compartilhado entre
// CvAdaptationService.verifyGuestPossessionToken e OAuthAttemptService para
// não acoplar AuthModule a CvAdaptationModule (o teste de integração de
// AuthService compila o AuthModule real via Nest DI; importar o módulo
// inteiro de cv-adaptation ali só para checar um hash seria peso e risco
// desnecessários). jobId (cuid) identifica uma AnalysisJob, mas nunca
// autentica posse dela sozinho — só quem tem o token cru consegue passar
// aqui.
export function hashGuestPossessionToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

export function possessionTokenMatchesHash(
  rawToken: string,
  storedHash: string,
): boolean {
  const expectedBuf = Buffer.from(storedHash);
  const receivedBuf = Buffer.from(hashGuestPossessionToken(rawToken));

  return (
    expectedBuf.length === receivedBuf.length &&
    timingSafeEqual(expectedBuf, receivedBuf)
  );
}
