"use client";

import { useState, useTransition } from "react";

import { ConfirmDialog } from "./confirm-dialog";

const GEIST = "var(--font-geist), -apple-system, system-ui, sans-serif";

type Props = { action: () => Promise<void> };

export function ClearAllButton({ action }: Props) {
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);

  const handleConfirm = () => {
    setConfirming(false);
    startTransition(() => {
      action();
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setConfirming(true)}
        disabled={pending}
        className="inline-flex items-center gap-1.5 rounded-[8px] border px-3 py-1.5 font-medium transition-colors disabled:opacity-50"
        style={{
          fontFamily: GEIST,
          fontSize: "12.5px",
          color: "#9a3d28",
          borderColor: "rgba(154,61,40,0.28)",
        }}
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 14 14"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <polyline points="1 3.5 13 3.5" />
          <path d="M11.5 3.5v8a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1v-8" />
          <path d="M4.5 3.5V2a.5.5 0 0 1 .5-.5h4a.5.5 0 0 1 .5.5v1.5" />
        </svg>
        {pending ? "Limpando..." : "Limpar tudo"}
      </button>

      {confirming && (
        <ConfirmDialog
          title="Limpar todos os campos?"
          description="Todos os dados do CV Master serão apagados. O arquivo original não é afetado — você pode re-extrair fazendo um novo upload."
          confirmLabel="Limpar tudo"
          danger
          onConfirm={handleConfirm}
          onCancel={() => setConfirming(false)}
        />
      )}
    </>
  );
}
