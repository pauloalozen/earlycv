"use client";

import { useState, useTransition } from "react";

import { buttonVariants } from "@/app/admin/_components/admin-button";
import {
  AdminCard,
  AdminPill,
  AT,
} from "@/app/admin/_components/admin-primitives";
import type { PaymentRecoveryTestEmailResult } from "@/lib/admin-payment-recovery-api";
import type { RecoveryTestEmailUiResult } from "../actions";

type Props = {
  onSendTest: (email: string) => Promise<RecoveryTestEmailUiResult>;
};

const REAL_SEND_LABEL: Record<
  PaymentRecoveryTestEmailResult["realSendWouldBe"],
  { tone: "ok" | "warn" | "danger"; text: string }
> = {
  sent: { tone: "ok", text: "seria enviado de verdade" },
  dry_run: {
    tone: "warn",
    text: "seria pulado: dry-run ativo (PAYMENT_RECOVERY_EMAIL_DRY_RUN)",
  },
  email_disabled: {
    tone: "danger",
    text: "seria pulado: envio desativado (PAYMENT_RECOVERY_EMAIL_ENABLED)",
  },
  allowlist_blocked: {
    tone: "warn",
    text: "seria pulado para este email: fora da allowlist",
  },
};

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 py-1">
      <span style={{ color: AT.muted2, minWidth: 150 }}>{label}</span>
      <span style={{ color: AT.ink2 }}>{children}</span>
    </div>
  );
}

export function RecoveryTestEmailClient({ onSendTest }: Props) {
  const [email, setEmail] = useState("");
  const [outcome, setOutcome] = useState<RecoveryTestEmailUiResult | null>(
    null,
  );
  const [isPending, startTransition] = useTransition();

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (isPending) return;
    startTransition(async () => {
      try {
        setOutcome(await onSendTest(email));
      } catch {
        setOutcome({
          kind: "error",
          message: "Nao foi possivel concluir a operacao. Tente novamente.",
        });
      }
    });
  };

  const result = outcome?.kind === "result" ? outcome.result : null;
  const realSend = result ? REAL_SEND_LABEL[result.realSendWouldBe] : null;

  return (
    <div className="mb-4">
      <AdminCard>
        <p
          style={{ color: AT.ink, fontSize: 13.5, fontWeight: 600 }}
          className="mb-1"
        >
          Enviar email de teste
        </p>
        <p style={{ color: AT.muted, fontSize: 12.5 }} className="mb-3">
          Usa o mesmo template e o mesmo provedor do envio real, com dados
          fictícios. Ignora dry-run e allowlist, não registra envio e o link não
          retoma nenhum pedido.
        </p>
        <form className="flex flex-wrap gap-2" onSubmit={submit}>
          <input
            aria-label="Email de teste"
            className="h-9 w-72 rounded-md border px-3 text-[12.5px]"
            style={{
              borderColor: AT.border,
              background: AT.card,
              color: AT.ink2,
            }}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="email@exemplo.com"
            required
            type="email"
            value={email}
          />
          <button
            className={buttonVariants()}
            disabled={isPending}
            type="submit"
          >
            {isPending ? "Enviando…" : "Enviar teste"}
          </button>
        </form>

        {outcome?.kind === "error" ? (
          <p
            className="mt-3"
            role="status"
            style={{ color: AT.danger, fontSize: 12.5 }}
          >
            {outcome.message}
          </p>
        ) : null}

        {result && realSend ? (
          <div
            className="mt-3 text-[12.5px]"
            role="status"
            style={{ borderTop: `1px solid ${AT.borderSoft}`, paddingTop: 10 }}
          >
            <Row label="Teste">
              {result.status === "failed" ? (
                <AdminPill tone="danger">
                  falhou no provedor: {result.errorMessage}
                </AdminPill>
              ) : result.mockedLocally ? (
                <AdminPill tone="info">
                  ambiente local: envio simulado (veja o log da API)
                </AdminPill>
              ) : (
                <AdminPill tone="ok">enviado para {result.to}</AdminPill>
              )}
            </Row>
            {result.providerMessageId ? (
              <Row label="ID no provedor">
                <span style={{ fontFamily: '"Geist Mono", monospace' }}>
                  {result.providerMessageId}
                </span>
              </Row>
            ) : null}
            <Row label="Envio real neste ambiente">
              <AdminPill tone={realSend.tone}>{realSend.text}</AdminPill>
            </Row>
            <Row label="Remetente">{result.config.from}</Row>
            <Row label="URL do link">{result.config.frontendUrl}</Row>
            <Row label="Allowlist">
              {result.config.allowlistSize === 0
                ? "vazia (todos liberados)"
                : `${result.config.allowlistSize} email(s)`}
            </Row>
          </div>
        ) : null}
      </AdminCard>
    </div>
  );
}
