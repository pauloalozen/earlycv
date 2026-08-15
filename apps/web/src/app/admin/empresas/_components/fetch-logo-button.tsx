"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { buttonVariants } from "@/app/admin/_components/admin-button";

// Ação síncrona por empresa (POST /companies/:id/fetch-logo) — busca em
// lote (todos os adapters implementados, ou um específico) fica no popup
// "Criar job" da aba Jobs (jobType LOGO_FETCH), não aqui. router.refresh()
// depois de sucesso porque a página é Server Component e o resultado
// (Company.logoUrl) já foi persistido no backend.
export function FetchLogoButton({ companyId }: { companyId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleClick() {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/companies/${companyId}/fetch-logo`, {
        method: "POST",
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setMessage(data?.error ?? "Falha ao buscar logo.");
        return;
      }
      if (data?.status === "completed") {
        setMessage("Logo encontrado.");
        router.refresh();
      } else if (data?.status === "skipped") {
        setMessage(data.reason ?? "Nenhuma fonte suportada.");
      } else {
        setMessage(data?.errorSummary ?? "Logo não encontrado.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        className={buttonVariants({ size: "sm", variant: "outline" })}
        disabled={loading}
        onClick={handleClick}
        type="button"
      >
        {loading ? "Buscando..." : "Buscar logo"}
      </button>
      {message ? (
        <span className="text-[11px] text-[#8a8580]">{message}</span>
      ) : null}
    </div>
  );
}
