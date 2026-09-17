"use client";

import { useActionState } from "react";

import { buttonVariants } from "@/app/admin/_components/admin-button";
import { AT } from "@/app/admin/_components/admin-primitives";
import {
  type UpdateProductUpdateActionState,
  updateProductUpdateAction,
} from "../actions";

const INITIAL_STATE: UpdateProductUpdateActionState = {
  status: "idle",
  message: "",
};

function inputStyle(): React.CSSProperties {
  return {
    padding: "9px 11px",
    borderRadius: 8,
    border: "1px solid rgba(10,10,10,0.12)",
    fontSize: 13,
    fontFamily: "inherit",
    width: "100%",
  };
}

function labelStyle(): React.CSSProperties {
  return {
    display: "grid",
    gap: 4,
    fontSize: 12,
    fontWeight: 600,
    color: "#6a6560",
  };
}

type EditableProductUpdate = {
  subject: string;
  preheader: string | null;
  content: string;
  primaryButtonText: string | null;
  primaryButtonUrl: string | null;
  optionalFooterContent: string | null;
};

// Client component só pra este form — useActionState nunca navega a
// página quando a action devolve estado (em vez de redirect()), então um
// erro de validação (ex.: primaryButtonUrl insegura) nunca apaga o que o
// admin digitou: os inputs continuam não controlados (defaultValue), o
// React só re-renderiza a mensagem de erro por cima, o DOM dos campos
// nunca é descartado.
export function ProductUpdateEditorForm({
  id,
  editable,
  productUpdate,
}: {
  id: string;
  editable: boolean;
  productUpdate: EditableProductUpdate;
}) {
  const [state, formAction, isPending] = useActionState(
    updateProductUpdateAction,
    INITIAL_STATE,
  );

  return (
    <>
      {!editable ? (
        <p style={{ fontSize: 12.5, color: "#8a8580", marginBottom: 12 }}>
          Campanha não pode mais ser editada neste status.
        </p>
      ) : null}

      {state.status !== "idle" ? (
        <div
          style={{
            marginBottom: 14,
            padding: "10px 14px",
            borderRadius: 8,
            fontSize: 12.5,
            background: state.status === "success" ? AT.okBg : AT.dangerBg,
            color: state.status === "success" ? AT.ok : AT.danger,
            border: `1px solid ${state.status === "success" ? "rgba(31,122,77,0.2)" : "rgba(155,44,44,0.2)"}`,
          }}
        >
          {state.message}
        </div>
      ) : null}

      <form action={formAction} style={{ display: "grid", gap: 10 }}>
        <input type="hidden" name="id" value={id} />

        <label style={labelStyle()}>
          Assunto
          <input
            type="text"
            name="subject"
            defaultValue={productUpdate.subject}
            disabled={!editable}
            style={inputStyle()}
          />
        </label>

        <label style={labelStyle()}>
          Preheader (texto de prévia)
          <input
            type="text"
            name="preheader"
            defaultValue={productUpdate.preheader ?? ""}
            disabled={!editable}
            style={inputStyle()}
          />
        </label>

        <label style={labelStyle()}>
          Conteúdo (parágrafos separados por linha em branco; para link use{" "}
          [texto](https://...))
          <textarea
            name="content"
            defaultValue={productUpdate.content}
            disabled={!editable}
            rows={8}
            style={{ ...inputStyle(), resize: "vertical" }}
          />
        </label>

        <label style={labelStyle()}>
          Texto do botão principal (opcional)
          <input
            type="text"
            name="primaryButtonText"
            defaultValue={productUpdate.primaryButtonText ?? ""}
            disabled={!editable}
            style={inputStyle()}
          />
        </label>

        <label style={labelStyle()}>
          URL do botão principal (opcional — precisa ser https://, sem
          javascript:/data:)
          <input
            type="text"
            name="primaryButtonUrl"
            defaultValue={productUpdate.primaryButtonUrl ?? ""}
            disabled={!editable}
            style={inputStyle()}
          />
        </label>

        <label style={labelStyle()}>
          Rodapé opcional
          <textarea
            name="optionalFooterContent"
            defaultValue={productUpdate.optionalFooterContent ?? ""}
            disabled={!editable}
            rows={2}
            style={{ ...inputStyle(), resize: "vertical" }}
          />
        </label>

        {editable ? (
          <div>
            <button
              type="submit"
              className={buttonVariants()}
              disabled={isPending}
            >
              {isPending ? "Salvando..." : "Salvar rascunho"}
            </button>
          </div>
        ) : null}
      </form>
    </>
  );
}
