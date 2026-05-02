import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import type {
  PaymentAuditEntry,
  PaymentDetailRecord,
} from "@/lib/admin-payments-api";
import { getAdminPaymentDetail } from "@/lib/admin-payments-api";
import { ReconcileButton } from "./_components/reconcile-button";

export const metadata: Metadata = { title: "Detalhe do Pagamento" };

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function statusClass(status: string) {
  if (status === "completed") return "text-green-700 bg-green-50";
  if (status === "pending") return "text-yellow-700 bg-yellow-50";
  if (status === "failed") return "text-red-700 bg-red-50";
  return "text-stone-600 bg-stone-100";
}

function eventIcon(eventType: string) {
  if (eventType.includes("approved") || eventType.includes("reconcil"))
    return "✓";
  if (eventType.includes("reject") || eventType.includes("fail")) return "✗";
  if (eventType.includes("duplicat")) return "↩";
  if (eventType.includes("invalid") || eventType.includes("error")) return "!";
  return "·";
}

function eventClass(actionTaken: string) {
  if (actionTaken === "approved") return "text-green-700";
  if (
    actionTaken === "failed" ||
    actionTaken === "invalid_signature" ||
    actionTaken === "error"
  )
    return "text-red-600";
  if (actionTaken === "duplicated") return "text-stone-400";
  return "text-stone-600";
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-stone-400">
        {label}
      </dt>
      <dd className="mt-0.5 font-mono text-sm text-stone-800 break-all">
        {value ?? <span className="text-stone-300">—</span>}
      </dd>
    </div>
  );
}

export default async function AdminPagamentoDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let detail: PaymentDetailRecord;
  try {
    detail = await getAdminPaymentDetail(id);
  } catch {
    notFound();
  }

  const { checkout, auditLogs } = detail;
  const isPending = checkout.status === "pending";
  const isCompleted = checkout.status === "completed";

  return (
    <div className="px-6 py-8 max-w-4xl">
      <div className="mb-6 flex items-center gap-3">
        <Link
          href="/admin/pagamentos"
          className="text-sm text-stone-400 hover:text-stone-700"
        >
          ← Pagamentos
        </Link>
        <span className="text-stone-300">/</span>
        <span className="font-mono text-sm text-stone-600">
          {id.slice(0, 12)}…
        </span>
      </div>

      <div className="mb-8 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-stone-900">
            Plano — {checkout.planName ?? "Créditos"}
          </h1>
          <p className="mt-1 text-sm text-stone-500">
            {checkout.userEmail ?? checkout.userId}
          </p>
        </div>
        <span
          className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-medium ${statusClass(checkout.status)}`}
        >
          {checkout.status}
        </span>
      </div>

      {/* Dados do checkout */}
      <section className="mb-8 rounded-xl border border-stone-200 bg-white p-6">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-stone-500">
          Dados do checkout
        </h2>
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Checkout ID" value={checkout.checkoutId} />
          <Field label="Tipo" value="Plano" />
          <Field label="User ID" value={checkout.userId} />
          <Field label="E-mail" value={checkout.userEmail} />
          <Field label="Status interno" value={checkout.status} />
          <Field
            label="Valor"
            value={
              checkout.amountInCents !== null
                ? `R$ ${(checkout.amountInCents / 100).toFixed(2).replace(".", ",")}`
                : null
            }
          />
          <Field
            label="External reference"
            value={checkout.externalReference}
          />
          <Field label="MP Payment ID" value={checkout.mpPaymentId} />
          <Field label="MP Preference ID" value={checkout.mpPreferenceId} />
          <Field label="Criado em" value={formatDate(checkout.createdAt)} />
          <Field label="Atualizado em" value={formatDate(checkout.updatedAt)} />
        </dl>
      </section>

      {/* Reconciliação */}
      {!isCompleted && (
        <section className="mb-8 rounded-xl border border-orange-100 bg-orange-50 p-6">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-orange-700">
            Reconciliação manual
          </h2>
          <p className="mb-4 text-sm text-orange-800">
            Consulta o Mercado Pago e libera os créditos da compra se o
            pagamento estiver aprovado.{" "}
            {isPending
              ? "Este pagamento está pendente."
              : "Este pagamento foi marcado como falho — só reconcilia se o MP confirmar aprovação."}
          </p>
          <ReconcileButton checkoutId={checkout.checkoutId} />
        </section>
      )}

      {/* Timeline de auditoria */}
      <section className="rounded-xl border border-stone-200 bg-white p-6">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-stone-500">
          Histórico de eventos ({auditLogs.length})
        </h2>

        {auditLogs.length === 0 && (
          <p className="text-sm text-stone-400">Nenhum evento registrado.</p>
        )}

        <ol className="space-y-4">
          {auditLogs.map((log: PaymentAuditEntry) => (
            <li key={log.id} className="flex gap-4">
              <div className="flex flex-col items-center">
                <span
                  className={`flex h-7 w-7 items-center justify-center rounded-full border text-xs font-bold ${eventClass(log.actionTaken)} border-current bg-white`}
                >
                  {eventIcon(log.eventType)}
                </span>
                <div className="w-px flex-1 bg-stone-100 mt-1" />
              </div>
              <div className="pb-4 flex-1 min-w-0">
                <div className="flex items-baseline justify-between gap-2 flex-wrap">
                  <span className="font-medium text-sm text-stone-800">
                    {log.eventType}
                  </span>
                  <span className="text-xs text-stone-400 whitespace-nowrap">
                    {formatDate(log.createdAt)}
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap gap-2 text-xs text-stone-500">
                  <span>
                    ação: <strong>{log.actionTaken}</strong>
                  </span>
                  {log.mpStatus && (
                    <span>
                      mp_status: <strong>{log.mpStatus}</strong>
                    </span>
                  )}
                  {log.mpPaymentId && (
                    <span>
                      payment_id:{" "}
                      <code className="font-mono">{log.mpPaymentId}</code>
                    </span>
                  )}
                </div>
                {log.errorMessage && (
                  <p className="mt-1 rounded bg-red-50 px-2 py-1 text-xs text-red-700">
                    {log.errorMessage}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
