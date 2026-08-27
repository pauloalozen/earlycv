// Referência leve da análise guest pendente de claim — não o resultado em
// si (isso nunca chega ao browser com o gate ligado), só o suficiente para
// retomar o claim depois da autenticação: jobId (não é segredo) +
// guestPossessionToken (é o segredo — nunca deve ir para URL, cookie
// httpOnly-less, ou qualquer lugar que sobreviva além desta aba).
//
// sessionStorage é deliberado aqui: é por aba, ao contrário de localStorage
// ou cookie — resolve "mecanismo seguro por aba" para o fluxo de
// email/senha (que não tem o problema de round-trip do OAuth, mas ainda
// assim não deveria vazar entre abas se o usuário tiver duas análises
// guest abertas em paralelo).
const KEY = "guest_analysis_pending";

export type PendingGuestAnalysis = {
  jobId: string;
  guestPossessionToken: string;
};

export function setPendingGuestAnalysis(value: PendingGuestAnalysis) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(value));
  } catch {
    // sessionStorage indisponível — sem retomada automática, mas o
    // processamento no backend continua normalmente.
  }
}

export function getPendingGuestAnalysis(): PendingGuestAnalysis | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PendingGuestAnalysis>;
    if (
      typeof parsed.jobId !== "string" ||
      typeof parsed.guestPossessionToken !== "string"
    ) {
      return null;
    }
    return {
      jobId: parsed.jobId,
      guestPossessionToken: parsed.guestPossessionToken,
    };
  } catch {
    return null;
  }
}

export function clearPendingGuestAnalysis() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {
    // no-op
  }
}
