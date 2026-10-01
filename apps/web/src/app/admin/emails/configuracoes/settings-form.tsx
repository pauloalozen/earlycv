"use client";

import { useActionState, useState, useTransition } from "react";

import { buttonVariants } from "@/app/admin/_components/admin-button";
import { AT } from "@/app/admin/_components/admin-primitives";
import type { EmailDispatchMode } from "@/lib/admin-emails-api";
import { MODE_HELP, MODE_LABEL } from "../_components/email-labels";
import { type EmailsActionState, updateEmailSettingsAction } from "../actions";

const INITIAL_STATE: EmailsActionState = { status: "idle", message: "" };
const MODES: EmailDispatchMode[] = ["OFF", "SHADOW", "ALLOWLIST", "LIVE"];

const inputStyle: React.CSSProperties = {
  padding: "9px 11px",
  borderRadius: 8,
  border: "1px solid rgba(10,10,10,0.12)",
  fontSize: 13,
  fontFamily: "inherit",
  width: "100%",
  background: "#fafaf6",
};

const labelStyle: React.CSSProperties = {
  display: "grid",
  gap: 4,
  fontSize: 12,
  fontWeight: 600,
  color: AT.muted,
};

type Initial = {
  welcomeMode: EmailDispatchMode;
  feedbackMode: EmailDispatchMode;
  feedbackSecondCallMode: EmailDispatchMode;
  purchaseConfirmationMode: EmailDispatchMode;
  startAtInput: string;
  allowlist: string;
  extraBlocklist: string;
};

function ModeSelect({
  name,
  label,
  value,
  onChange,
}: {
  name: string;
  label: string;
  value: EmailDispatchMode;
  onChange: (mode: EmailDispatchMode) => void;
}) {
  return (
    <label style={labelStyle}>
      {label}
      <select
        name={name}
        value={value}
        onChange={(event) => onChange(event.target.value as EmailDispatchMode)}
        style={inputStyle}
      >
        {MODES.map((mode) => (
          <option key={mode} value={mode}>
            {MODE_LABEL[mode]}
          </option>
        ))}
      </select>
      <span style={{ fontWeight: 400 }}>{MODE_HELP[value]}</span>
    </label>
  );
}

// Client component só para este form — useActionState devolve estado em vez de
// redirecionar, então um erro de validação do backend (cutoff ausente,
// allowlist vazia, LIVE sem confirmação) nunca apaga o que o admin digitou.
export function EmailSettingsForm({ initial }: { initial: Initial }) {
  const [state, formAction, isActionPending] = useActionState(
    updateEmailSettingsAction,
    INITIAL_STATE,
  );
  const [isTransitionPending, startTransition] = useTransition();
  const isPending = isActionPending || isTransitionPending;
  const [welcome, setWelcome] = useState(initial.welcomeMode);
  const [feedback, setFeedback] = useState(initial.feedbackMode);
  const [feedbackSecondCall, setFeedbackSecondCall] = useState(
    initial.feedbackSecondCallMode,
  );
  const [purchase, setPurchase] = useState(initial.purchaseConfirmationMode);
  const anyLive = [welcome, feedback, feedbackSecondCall, purchase].includes(
    "LIVE",
  );

  return (
    <>
      {state.status !== "idle" ? (
        <div
          role={state.status === "error" ? "alert" : "status"}
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

      {/* onSubmit + startTransition em vez de <form action>: no React 19 o
          atributo action RESETA os campos ao fim da action, o que apagaria o
          que o admin digitou quando o backend recusa a configuração. */}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          startTransition(() => formAction(data));
        }}
        style={{ display: "grid", gap: 16, maxWidth: 720 }}
      >
        <ModeSelect
          name="welcomeMode"
          label="Boas-vindas"
          value={welcome}
          onChange={setWelcome}
        />
        <ModeSelect
          name="feedbackMode"
          label="Feedback (24h após o cadastro)"
          value={feedback}
          onChange={setFeedback}
        />
        <ModeSelect
          name="feedbackSecondCallMode"
          label="Feedback segunda chamada (14 dias após o envio do feedback)"
          value={feedbackSecondCall}
          onChange={setFeedbackSecondCall}
        />
        <ModeSelect
          name="purchaseConfirmationMode"
          label="Confirmação de compra"
          value={purchase}
          onChange={setPurchase}
        />

        <label style={labelStyle}>
          Cutoff (horário de Brasília)
          <input
            type="datetime-local"
            name="startAt"
            defaultValue={initial.startAtInput}
            style={{ ...inputStyle, maxWidth: 260 }}
          />
          <span style={{ fontWeight: 400 }}>
            Só cadastros e compras criados a partir daqui entram — a base antiga
            nunca recebe. Obrigatório para ligar qualquer tipo.
          </span>
        </label>

        <label style={labelStyle}>
          Allowlist (um e-mail por linha) — usada no modo "Só allowlist"
          <textarea
            name="allowlist"
            defaultValue={initial.allowlist}
            rows={4}
            style={{ ...inputStyle, resize: "vertical" }}
          />
        </label>

        <label style={labelStyle}>
          Bloqueio extra (um e-mail por linha)
          <textarea
            name="extraBlocklist"
            defaultValue={initial.extraBlocklist}
            rows={3}
            style={{ ...inputStyle, resize: "vertical" }}
          />
          <span style={{ fontWeight: 400 }}>
            Acrescenta às contas sempre bloqueadas nos envios de relacionamento:
            paulo.alozen@gmail.com e contato@earlycv.com.br.
          </span>
        </label>

        {anyLive ? (
          <label
            style={{
              display: "flex",
              gap: 8,
              alignItems: "flex-start",
              fontSize: 12.5,
              padding: "10px 12px",
              borderRadius: 8,
              background: AT.warnBg,
              color: AT.warn,
            }}
          >
            <input
              type="checkbox"
              name="confirmLive"
              style={{ marginTop: 2 }}
            />
            Confirmo que "Ao vivo" envia e-mails de verdade para usuários reais
            (a partir do cutoff). Fora de produção "Ao vivo" é rebaixado para
            allowlist e o transporte é fake.
          </label>
        ) : null}

        <div>
          <button
            type="submit"
            className={buttonVariants()}
            disabled={isPending}
          >
            {isPending ? "Salvando..." : "Salvar configurações"}
          </button>
        </div>
      </form>
    </>
  );
}
