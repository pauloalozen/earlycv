// Leitura client-side do gate de autenticação guest (Fase 5 —
// specs/no-guest-analysis-preview-auth-gate-diagnostic-plan-ADENDO-hardening.md
// seção 8.2). O backend continua a autoridade final em todo endpoint que
// importa; isto só decide qual UI mostrar. Nunca cacheado — chamado uma vez
// por carregamento de página via fetch simples (sem SWR/cache do Next).
export async function fetchGuestAnalysisAuthGateEnabled(): Promise<boolean> {
  try {
    const response = await fetch("/api/cv-adaptation/config/public", {
      cache: "no-store",
    });
    if (!response.ok) return false;
    const body = (await response.json()) as {
      guestAnalysisAuthGateEnabled?: boolean;
    };
    return body.guestAnalysisAuthGateEnabled === true;
  } catch {
    // Nunca trava a UI por causa disso — assume desligada (comportamento
    // atual) se a config não puder ser lida.
    return false;
  }
}
