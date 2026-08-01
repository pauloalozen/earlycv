"use client";

import { useActionState, useState } from "react";
import { buttonVariants } from "@/app/admin/_components/admin-button";
import { AT } from "@/app/admin/_components/admin-primitives";
import type { FilterActionUiResult } from "../actions";

type Props = {
  discardId: string;
  suggestedTerm: string;
  title: string;
  whitelistAction: (
    state: FilterActionUiResult | null,
    formData: FormData,
  ) => Promise<FilterActionUiResult>;
};

export function WhitelistDiscardDialog({
  discardId,
  suggestedTerm,
  title,
  whitelistAction,
}: Props) {
  const [open, setOpen] = useState(false);
  const [state, formAction, isPending] = useActionState(whitelistAction, null);

  return (
    <>
      <button
        className={buttonVariants({ size: "sm", variant: "outline" })}
        onClick={() => setOpen(true)}
        type="button"
      >
        Whitelist
      </button>

      {open && (
        // biome-ignore lint/a11y/useSemanticElements: backdrop precisa envolver o modal (que tem seu proprio <button>), nao pode virar <button>
        <div
          onClick={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") setOpen(false);
          }}
          role="button"
          style={{
            alignItems: "center",
            background: "rgba(10,10,10,0.45)",
            display: "flex",
            inset: 0,
            justifyContent: "center",
            position: "fixed",
            zIndex: 60,
          }}
          tabIndex={-1}
        >
          <div
            style={{
              background: AT.card,
              borderRadius: 12,
              maxWidth: 480,
              padding: 24,
              width: "90%",
            }}
          >
            <h3 style={{ fontSize: 15, fontWeight: 600, color: AT.ink }}>
              Adicionar ao filtro semantico
            </h3>
            <p style={{ color: AT.muted, fontSize: 12, marginTop: 8 }}>
              Titulo descartado: <span style={{ color: AT.ink2 }}>{title}</span>
            </p>

            <form action={formAction}>
              <input name="id" type="hidden" value={discardId} />
              <label
                htmlFor="term"
                style={{
                  color: AT.muted2,
                  display: "block",
                  fontFamily: '"Geist Mono", monospace',
                  fontSize: 10,
                  fontWeight: 500,
                  letterSpacing: 1,
                  marginTop: 16,
                  textTransform: "uppercase",
                }}
              >
                Termo a adicionar em techSignals
              </label>
              <input
                className="h-9 w-full rounded-md border px-3 text-[12.5px]"
                defaultValue={suggestedTerm}
                id="term"
                name="term"
                style={{
                  background: "#fafaf6",
                  borderColor: "rgba(10,10,10,0.08)",
                  color: "#2a2620",
                  marginTop: 4,
                }}
                type="text"
              />

              {state && (
                <p
                  style={{
                    color: state.kind === "success" ? AT.ok : "#b91c1c",
                    fontSize: 12,
                    marginTop: 10,
                  }}
                >
                  {state.message}
                  {state.kind === "success" &&
                    " Proxima ingestao vai capturar vagas com esse padrao."}
                </p>
              )}

              <div
                style={{
                  display: "flex",
                  gap: 8,
                  justifyContent: "flex-end",
                  marginTop: 20,
                }}
              >
                <button
                  className={buttonVariants({
                    size: "sm",
                    variant: "outline",
                  })}
                  onClick={() => setOpen(false)}
                  type="button"
                >
                  Cancelar
                </button>
                <button
                  className={buttonVariants({ size: "sm" })}
                  disabled={isPending}
                  type="submit"
                >
                  {isPending
                    ? "Adicionando..."
                    : "Adicionar e criar nova versao do filtro"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
