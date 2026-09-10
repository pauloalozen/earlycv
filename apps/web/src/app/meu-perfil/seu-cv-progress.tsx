"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ProgressRing } from "@/components/progress-ring";
import { claimGuestAnalysisJob } from "@/lib/cv-adaptation-api";
import { getPendingGuestAnalysis } from "@/lib/guest-analysis-pending";

// Achado real de auditoria (2026-09-09): logo após cadastro/login vindo de
// uma análise guest, este card podia renderizar 0% — não porque o perfil
// estivesse vazio, mas porque a página foi montada ANTES da promoção de
// Master/sync de UserProfile terminar (claim ainda pendente). Só depois de
// visitar outra rota e voltar (nova requisição server-side) o valor real
// aparecia. Enquanto existir um claim de análise guest pendente
// (sessionStorage, o mesmo usado por register/login/social-callback), este
// componente mostra "Processando" em vez de um 0% enganoso, e força
// router.refresh() assim que o claim confirmar sucesso — sem exigir que o
// usuário navegue manualmente pra ver o valor real.
export function SeuCvProgress(props: {
  profileCompletion: number;
  masterResumeTitle: string | null;
}) {
  const router = useRouter();
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    const pending = getPendingGuestAnalysis();
    if (!pending) return;

    let active = true;
    setProcessing(true);

    const poll = async (attempt: number) => {
      if (!active) return;
      const result = await claimGuestAnalysisJob(
        pending.jobId,
        pending.guestPossessionToken,
      ).catch(() => ({ status: "error" as const }));

      if (!active) return;

      if (result.status === "succeeded") {
        setProcessing(false);
        router.refresh();
        return;
      }

      if (result.status === "pending" || result.status === "processing") {
        if (attempt >= 40) {
          setProcessing(false);
          return;
        }
        setTimeout(() => poll(attempt + 1), 2000);
        return;
      }

      // "failed"/"error": não há nada mais a esperar — solta o card pro
      // valor já resolvido pelo servidor (pode legitimamente ser 0%).
      setProcessing(false);
    };

    void poll(0);

    return () => {
      active = false;
    };
  }, [router]);

  if (processing) {
    return (
      <div className="flex items-center gap-3 rounded-[10px] border border-[rgba(10,10,10,0.07)] px-3 py-3">
        <svg
          aria-hidden="true"
          className="h-16 w-16 shrink-0 animate-spin text-[#c8c8c2]"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
        >
          <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
        </svg>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13.5px] font-medium text-[#0a0a0a]">
            Processando seu perfil...
          </p>
          <span className="text-[11px] text-[#8a8a85]">
            Isso leva só alguns segundos
          </span>
        </div>
      </div>
    );
  }

  return (
    <>
      <ProgressRing value={props.profileCompletion} size={64} stroke={5} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13.5px] font-medium text-[#0a0a0a]">
          {props.masterResumeTitle ?? "Nenhum CV cadastrado ainda"}
        </p>
        <span className="flex items-center gap-1 text-[11px] text-[#8a8a85] transition-colors group-hover:text-[#0a0a0a]">
          Abrir Meu CV Master
          <Chevron />
        </span>
      </div>
    </>
  );
}

function Chevron() {
  return (
    <svg
      aria-hidden="true"
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="transition-transform group-hover:translate-x-0.5"
    >
      <path d="M9 18l6-6-6-6" />
    </svg>
  );
}
