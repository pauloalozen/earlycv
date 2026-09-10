"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { claimGuestAnalysisJob } from "@/lib/cv-adaptation-api";
import { clearGuestAnalysisRaw } from "@/lib/guest-analysis-storage";
import {
  clearPendingGuestAnalysis,
  getPendingGuestAnalysis,
} from "@/lib/guest-analysis-pending";

export function GuestAnalysisClaimer() {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "claiming" | "done" | "error">(
    "idle",
  );

  useEffect(() => {
    const pending = getPendingGuestAnalysis();
    if (!pending) return;

    setStatus("claiming");

    // Único choke point de claim: resolve a AnalysisJob original por
    // jobId+guestPossessionToken — nunca reconstrói a fonte a partir de
    // conteúdo salvo no navegador (masterCvText/adaptedContentJson do
    // localStorage nunca são a fonte de verdade do claim).
    claimGuestAnalysisJob(pending.jobId, pending.guestPossessionToken)
      .then((result) => {
        clearPendingGuestAnalysis();
        clearGuestAnalysisRaw();

        if (result.status === "succeeded") {
          setStatus("done");
          // Independente de como o usuário criou a conta (email, Google,
          // link do header etc.), se tinha uma análise guest pendente, ele
          // deve cair direto nela — não no /meu-perfil genérico.
          router.push(
            `/adaptar/resultado?adaptationId=${result.cvAdaptationId}`,
          );
          return;
        }

        if (result.status === "pending" || result.status === "processing") {
          // Claim aceito, mas a projeção/materialização ainda não
          // terminou — /adaptar/resultado sabe retomar por claimJobId
          // (pollAndClaim), sem precisar reenviar nada do navegador.
          setStatus("done");
          router.push(`/adaptar/resultado?claimJobId=${pending.jobId}`);
          return;
        }

        setStatus("error");
      })
      .catch((err: unknown) => {
        console.error(
          "[GuestAnalysisClaimer] claimGuestAnalysisJob failed:",
          err,
        );
        setStatus("error");
      });
  }, [router]);

  if (status === "idle" || status === "done") return null;

  if (status === "claiming") {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-[#E8E8E8] bg-white px-5 py-3">
        <svg
          aria-hidden="true"
          className="animate-spin shrink-0 text-gray-400"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
        >
          <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
        </svg>
        <p className="text-sm text-[#666666]">
          Salvando sua análise anterior...
        </p>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-5 py-3">
        <p className="text-sm text-red-700">
          Não foi possível salvar a análise anterior. Tente analisar novamente.
        </p>
      </div>
    );
  }

  return null;
}
