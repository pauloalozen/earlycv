"use client";

import { useEffect, useState } from "react";
import {
  clearPendingSavedJob,
  getPendingSavedJob,
} from "@/lib/saved-job-pending";
import { saveJob } from "@/lib/saved-jobs-api";

// Espelha dashboard/guest-analysis-claimer.tsx pro mesmo tipo de gap:
// visitante anônimo clica em "salvar vaga" (SaveJobBtn/SaveJobTextBtn/
// SaveJobCtaBtn em save-job-btn.tsx), é redirecionado pro /entrar sem
// nenhum contexto de QUAL vaga — a conta era criada/logada e a vaga nunca
// era salva de verdade. useSaveJobToggle agora guarda a intenção em
// sessionStorage (setPendingSavedJob) antes do redirect; este componente,
// montado em /meu-perfil (destino padrão pós-signup sem `next`, ver
// getDefaultAppRedirectPath), lê e completa o save assim que a pessoa
// está autenticada.
export function SavedJobClaimer() {
  const [status, setStatus] = useState<"idle" | "saving" | "done" | "error">(
    "idle",
  );

  useEffect(() => {
    const pending = getPendingSavedJob();
    if (!pending) return;

    setStatus("saving");

    saveJob(pending.jobId, pending.origin)
      .then((ok) => {
        clearPendingSavedJob();
        setStatus(ok ? "done" : "error");
      })
      .catch((err: unknown) => {
        console.error("[SavedJobClaimer] saveJob failed:", err);
        clearPendingSavedJob();
        setStatus("error");
      });
  }, []);

  if (status !== "error") return null;

  return (
    <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-5 py-3">
      <p className="text-sm text-red-700">
        Não foi possível salvar a vaga que você marcou antes de criar a conta.
        Volte na vaga e salve de novo.
      </p>
    </div>
  );
}
