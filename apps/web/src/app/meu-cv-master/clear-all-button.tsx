"use client";

import { useTransition } from "react";

type Props = { action: () => Promise<void> };

export function ClearAllButton({ action }: Props) {
  const [pending, startTransition] = useTransition();

  const handleClick = () => {
    if (
      !confirm(
        "Limpar todos os campos do CV Master?\n\nTodos os dados serão apagados. O arquivo original não é afetado — você pode re-extrair fazendo um novo upload.",
      )
    )
      return;
    startTransition(() => {
      action();
    });
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      className="inline-flex items-center gap-1.5 rounded-[7px] border border-[rgba(154,61,40,0.22)] px-3 py-1.5 font-mono text-[10px] font-medium uppercase tracking-[0.06em] text-[#9a3d28] transition-colors hover:bg-[rgba(154,61,40,0.06)] disabled:opacity-50"
    >
      <svg
        width="11"
        height="11"
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
  );
}
