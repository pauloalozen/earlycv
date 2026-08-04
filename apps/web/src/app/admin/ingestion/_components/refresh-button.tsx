"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { buttonVariants } from "@/app/admin/_components/admin-button";

// router.refresh() reexecuta o server component da rota atual sem
// navegacao/reload de pagina inteira — os dados vem frescos do servidor,
// mas o estado de client (scroll, inputs) e preservado.
export function RefreshButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [justRefreshed, setJustRefreshed] = useState(false);

  function handleClick() {
    startTransition(() => {
      router.refresh();
    });
    setJustRefreshed(true);
    setTimeout(() => setJustRefreshed(false), 1500);
  }

  return (
    <button
      className={buttonVariants({ variant: "outline" })}
      disabled={isPending}
      onClick={handleClick}
      type="button"
    >
      {isPending
        ? "Atualizando..."
        : justRefreshed
          ? "Atualizado"
          : "Atualizar"}
    </button>
  );
}
