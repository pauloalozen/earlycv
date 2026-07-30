"use client";

import { useActionState } from "react";
import { buttonVariants } from "@/app/admin/_components/admin-button";
import type { FilterActionUiResult } from "../actions";

type Props = {
  activeConfig: {
    createdAt: string;
    description: string | null;
    noiseSignals: string[];
    techSignals: string[];
    version: string;
  } | null;
  saveAction: (
    state: FilterActionUiResult | null,
    formData: FormData,
  ) => Promise<FilterActionUiResult>;
};

const fieldClassName =
  "w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 outline-none focus-visible:border-stone-500";

export function SemanticFilterConfigForm({ activeConfig, saveAction }: Props) {
  const [state, formAction, isPending] = useActionState(saveAction, null);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      {activeConfig ? (
        <p className="text-xs text-stone-500">
          Versao ativa:{" "}
          <span className="font-medium">{activeConfig.version}</span> · criada
          em {new Date(activeConfig.createdAt).toLocaleString("pt-BR")}
        </p>
      ) : (
        <p className="text-xs text-amber-700">
          Nenhuma versao ativa encontrada. Salvar aqui cria a primeira.
        </p>
      )}

      <div>
        <label
          className="mb-1 block text-xs font-medium text-stone-700"
          htmlFor="techSignals"
        >
          techSignals (um por linha)
        </label>
        <textarea
          className={fieldClassName}
          defaultValue={activeConfig?.techSignals.join("\n") ?? ""}
          id="techSignals"
          name="techSignals"
          rows={8}
        />
      </div>

      <div>
        <label
          className="mb-1 block text-xs font-medium text-stone-700"
          htmlFor="noiseSignals"
        >
          noiseSignals (um por linha)
        </label>
        <textarea
          className={fieldClassName}
          defaultValue={activeConfig?.noiseSignals.join("\n") ?? ""}
          id="noiseSignals"
          name="noiseSignals"
          rows={8}
        />
      </div>

      <div>
        <label
          className="mb-1 block text-xs font-medium text-stone-700"
          htmlFor="description"
        >
          Descricao da mudanca (opcional)
        </label>
        <input
          className={fieldClassName}
          defaultValue=""
          id="description"
          name="description"
          type="text"
        />
      </div>

      <button
        className={buttonVariants({ size: "sm" })}
        disabled={isPending}
        type="submit"
      >
        {isPending ? "Salvando..." : "Salvar como nova versao"}
      </button>

      {state ? (
        <p
          className={
            state.kind === "success"
              ? "text-xs text-emerald-700"
              : "text-xs text-red-700"
          }
        >
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
