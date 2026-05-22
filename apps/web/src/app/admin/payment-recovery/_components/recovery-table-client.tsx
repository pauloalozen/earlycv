"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import type { PaymentRecoveryItem } from "@/lib/admin-payment-recovery-api";
import type { RecoveryActionUiResult } from "../actions";

type Props = {
  items: PaymentRecoveryItem[];
  onSendEmail: (
    purchaseId: string,
    forceResend?: boolean,
  ) => Promise<RecoveryActionUiResult>;
  onIgnore: (purchaseId: string, reason?: string) => Promise<RecoveryActionUiResult>;
  onUnignore: (purchaseId: string) => Promise<RecoveryActionUiResult>;
};

function statusRowClass(item: PaymentRecoveryItem) {
  if (item.ignored) return "bg-stone-50";
  if (item.eligibilityStatus === "eligible") return "bg-emerald-50/60";
  if (item.eligibilityStatus === "possibly_resolved") return "bg-amber-50/70";
  return "bg-rose-50/60";
}

function sendDisabledReason(item: PaymentRecoveryItem) {
  if (item.ignored) return "Pedido ignorado.";
  if (item.eligibilityStatus !== "eligible") return "Pedido inelegivel para envio.";
  return null;
}

function formatPurchaseCreatedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function RecoveryTableClient({
  items,
  onSendEmail,
  onIgnore,
  onUnignore,
}: Props) {
  const [message, setMessage] = useState<RecoveryActionUiResult | null>(null);
  const [pendingPurchaseId, setPendingPurchaseId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const [modalPurchase, setModalPurchase] = useState<PaymentRecoveryItem | null>(null);
  const [confirmResendPurchaseId, setConfirmResendPurchaseId] = useState<string | null>(null);

  const fallbackError: RecoveryActionUiResult = {
    kind: "error",
    message: "Nao foi possivel concluir a operacao. Tente novamente.",
  };

  const runAction = (
    purchaseId: string,
    callback: () => Promise<RecoveryActionUiResult>,
    afterSuccess?: () => void,
  ) => {
    if (pendingPurchaseId === purchaseId) {
      return;
    }

    setPendingPurchaseId(purchaseId);
    startTransition(async () => {
      try {
        const result = await callback();
        setMessage(result);
        afterSuccess?.();
        router.refresh();
      } catch {
        setMessage(fallbackError);
      } finally {
        setPendingPurchaseId(null);
      }
    });
  };

  return (
    <>
      {message ? (
        <p
          className={`mb-3 rounded-lg border px-3 py-2 text-sm ${message.kind === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-rose-200 bg-rose-50 text-rose-900"}`}
          role="status"
        >
          {message.message}
        </p>
      ) : null}
      <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-stone-100 bg-stone-50 text-left text-xs font-semibold uppercase tracking-wide text-stone-500">
            <tr>
              <th className="px-3 py-3">Data pedido</th>
              <th className="px-3 py-3">Usuario</th>
              <th className="px-3 py-3">Pedido</th>
              <th className="px-3 py-3">Origem</th>
              <th className="px-3 py-3">Vaga</th>
              <th className="px-3 py-3">Score</th>
              <th className="px-3 py-3">Creditos</th>
              <th className="px-3 py-3">Elegibilidade</th>
              <th className="px-3 py-3">Email</th>
              <th className="px-3 py-3">Acoes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {items.length === 0 ? (
              <tr>
                <td className="px-3 py-8 text-center text-stone-400" colSpan={10}>
                  Nenhum pedido pendente encontrado para os filtros aplicados.
                </td>
              </tr>
            ) : null}
            {items.map((item) => {
              const disabledReason = sendDisabledReason(item);
              const sendDisabled = Boolean(disabledReason);
              const rowPending = pendingPurchaseId === item.purchaseId && isPending;

              return (
                <tr className={statusRowClass(item)} key={item.purchaseId}>
                  <td className="px-3 py-3 text-stone-700">
                    {formatPurchaseCreatedAt(item.createdAt)}
                  </td>
                  <td className="px-3 py-3 text-stone-800">
                    {item.userName ?? item.userId}
                    <div className="text-xs text-stone-500">{item.userEmail ?? "—"}</div>
                  </td>
                  <td className="px-3 py-3 text-stone-700">
                    <div className="font-mono text-xs text-stone-600">{item.purchaseId}</div>
                  </td>
                  <td className="px-3 py-3 text-stone-700">{item.originAction ?? "—"}</td>
                  <td className="px-3 py-3 text-stone-700">{item.jobTitle ?? "—"}</td>
                  <td className="px-3 py-3 text-stone-700">{item.score ?? "—"}</td>
                  <td className="px-3 py-3 text-stone-700">{item.hasAvailableCredits ? "Disponiveis" : "Sem creditos"}</td>
                  <td className="px-3 py-3 text-stone-700">{item.ignored ? "ignored" : item.eligibilityStatus}</td>
                  <td className="px-3 py-3 text-stone-700">{item.alreadySent ? "Ja enviado" : "Nao enviado"}</td>
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap gap-2">
                      <button
                        className="rounded-md bg-stone-900 px-2 py-1 text-xs font-medium text-white disabled:opacity-50"
                        disabled={sendDisabled || rowPending}
                        onClick={() => {
                          setConfirmResendPurchaseId(null);
                          setModalPurchase(item);
                        }}
                        type="button"
                      >
                        Enviar email
                      </button>
                      {disabledReason ? <span className="text-xs text-stone-500">{disabledReason}</span> : null}
                      {item.ignored ? (
                        <button
                          className="rounded-md border border-stone-300 px-2 py-1 text-xs text-stone-700"
                          disabled={rowPending}
                          onClick={() => {
                            runAction(item.purchaseId, () => onUnignore(item.purchaseId));
                          }}
                          type="button"
                        >
                          Desfazer ignorar
                        </button>
                      ) : (
                        <button
                          className="rounded-md border border-stone-300 px-2 py-1 text-xs text-stone-700"
                          disabled={rowPending}
                          onClick={() => {
                            const reason = window.prompt(
                              "Motivo para ignorar (opcional):",
                            );
                            if (reason === null) {
                              return;
                            }
                            runAction(item.purchaseId, () =>
                              onIgnore(item.purchaseId, reason || undefined),
                            );
                          }}
                          type="button"
                        >
                          Ignorar
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {modalPurchase ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-lg rounded-xl border border-stone-200 bg-white p-5">
            <h2 className="text-lg font-bold text-stone-900">Confirmar envio de recuperacao</h2>
            <p className="mt-2 text-sm text-stone-600">
              Preview: email para {modalPurchase.userEmail ?? "usuario sem email"} sobre o pedido {modalPurchase.purchaseId}.
            </p>
            <p className="mt-2 text-xs text-stone-500">
              Aviso: ambiente pode estar em dry-run ou com allowlist, sem envio real.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                className="rounded-md border border-stone-300 px-3 py-2 text-sm"
                onClick={() => {
                  setConfirmResendPurchaseId(null);
                  setModalPurchase(null);
                }}
                type="button"
              >
                Cancelar
              </button>
              <button
                className="rounded-md bg-stone-900 px-3 py-2 text-sm text-white"
                disabled={pendingPurchaseId === modalPurchase.purchaseId}
                onClick={() => {
                  const purchaseId = modalPurchase.purchaseId;
                  const shouldConfirmResend =
                    modalPurchase.alreadySent && confirmResendPurchaseId !== purchaseId;
                  if (shouldConfirmResend) {
                    setConfirmResendPurchaseId(purchaseId);
                    return;
                  }
                  runAction(
                    purchaseId,
                    () => onSendEmail(purchaseId, modalPurchase.alreadySent),
                    () => {
                      setConfirmResendPurchaseId(null);
                      setModalPurchase(null);
                    },
                  );
                }}
                type="button"
              >
                {confirmResendPurchaseId === modalPurchase.purchaseId
                  ? "Reenviar mesmo assim"
                  : "Confirmar envio"}
              </button>
            </div>
            {confirmResendPurchaseId === modalPurchase.purchaseId ? (
              <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                Este email ja foi enviado anteriormente. Tem certeza que deseja reenviar?
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
