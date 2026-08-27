import "server-only";

function getApiBaseUrl() {
  const base =
    process.env.API_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    "http://localhost:4000";
  return base.endsWith("/api") ? base : `${base}/api`;
}

// Equivalente server-side de guest-analysis-auth-gate.ts — usado por Server
// Components que precisam decidir antes do render (gate de /adaptar, prop
// inicial da landing), evitando o fetch client-side extra e o estado
// transitório até o mount resolver. Mesmo fail-safe: qualquer falha assume
// flag desligada (comportamento atual, sem gate).
export async function fetchGuestAnalysisAuthGateEnabledServer(): Promise<boolean> {
  try {
    const response = await fetch(
      `${getApiBaseUrl()}/cv-adaptation/config/public`,
      { cache: "no-store" },
    );

    if (!response.ok) {
      return false;
    }

    const json = (await response.json()) as {
      guestAnalysisAuthGateEnabled?: unknown;
    };
    return json.guestAnalysisAuthGateEnabled === true;
  } catch {
    return false;
  }
}
