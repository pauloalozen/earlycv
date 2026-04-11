"use client";

import { useActionState } from "react";

import { buttonVariants } from "@/components/ui";

type Props = {
  currentCredits: number;
  setCreditsAction: (
    state: { message: string | null },
    formData: FormData,
  ) => Promise<{ message: string | null }>;
};

export function SetCreditsForm({ currentCredits, setCreditsAction }: Props) {
  const [state, formAction, isPending] = useActionState(setCreditsAction, {
    message: null,
  });

  return (
    <form action={formAction} className="space-y-3">
      <label
        className="block text-sm font-medium text-stone-700"
        htmlFor="creditsRemaining"
      >
        Creditos disponiveis (valor absoluto)
      </label>
      <input
        id="creditsRemaining"
        name="creditsRemaining"
        type="number"
        min={0}
        step={1}
        defaultValue={currentCredits}
        className="h-11 w-full rounded-lg border border-stone-200 bg-white px-3 text-sm text-stone-900"
      />
      <button
        type="submit"
        className={buttonVariants({ size: "sm" })}
        disabled={isPending}
      >
        {isPending ? "Atualizando..." : "Salvar creditos"}
      </button>
      {state.message ? (
        <p className="text-xs text-stone-600">{state.message}</p>
      ) : null}
    </form>
  );
}
