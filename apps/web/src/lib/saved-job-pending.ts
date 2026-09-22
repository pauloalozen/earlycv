// Referência leve da vaga que o visitante anônimo tentou salvar antes de
// ter conta — mesma lógica de guest-analysis-pending.ts (sessionStorage,
// por aba): jobId não é segredo, então não precisa da mesma cautela do
// guestPossessionToken, mas o padrão de storage por aba evita vazar
// "intenção de salvar" entre abas com jobs diferentes.
const KEY = "pending_saved_job";

export type PendingSavedJob = {
  jobId: string;
  origin: "RADAR" | "MONITOR";
};

export function setPendingSavedJob(value: PendingSavedJob) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(value));
  } catch {
    // sessionStorage indisponível — sem retomada automática pós-signup,
    // mas o redirect pro /entrar continua funcionando normalmente.
  }
}

export function getPendingSavedJob(): PendingSavedJob | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PendingSavedJob>;
    if (typeof parsed.jobId !== "string" || !parsed.jobId) return null;
    return {
      jobId: parsed.jobId,
      origin: parsed.origin === "MONITOR" ? "MONITOR" : "RADAR",
    };
  } catch {
    return null;
  }
}

export function clearPendingSavedJob() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {
    // idem — nunca quebra o fluxo por causa disso.
  }
}
