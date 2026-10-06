import Link from "next/link";
import { notFound } from "next/navigation";
import { buttonVariants } from "@/app/admin/_components/admin-button";
import {
  AdminCard,
  AdminPageWrap,
  AdminPill,
} from "@/app/admin/_components/admin-primitives";
import {
  AdminMockInterviewApiError,
  getAdminMockInterview,
  ORIGIN_LABELS,
  PAYMENT_STATUS_LABELS,
  SESSION_STATUS_LABELS,
} from "@/lib/admin-mock-interviews-api";
import { buildAdminMetadata } from "@/lib/route-metadata";
import { AdminShellHeader } from "../../_components/admin-shell-header";
import { MockInterviewEditForm } from "../_components/edit-form";
import { sessionTone } from "../_components/session-tone";

export const metadata = buildAdminMetadata("Entrevista simulada");

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
}

function formatCents(cents: number) {
  return `R$ ${(cents / 100).toFixed(2).replace(".", ",")}`;
}

const EVENT_LABELS: Record<string, string> = {
  checkout_created: "Checkout criado",
  payment_approved: "Pagamento aprovado",
  payment_failed: "Pagamento recusado",
  payment_refunded: "Pagamento estornado",
  payment_amount_mismatch: "Valor pago divergente",
  scheduled: "Sessão agendada",
  rescheduled: "Sessão remarcada",
  schedule_cleared: "Horário removido",
  session_status_changed: "Status da sessão alterado",
  meeting_url_changed: "Link do Meet alterado",
  notes_updated: "Anotações atualizadas",
  report_sent: "Relatório marcado como enviado",
  report_unmarked: "Relatório desmarcado",
  invite_sent: "Convite enviado por e-mail",
  invite_failed: "Falha ao enviar o convite",
};

function describeValue(value: string | null) {
  if (!value) return null;
  if (value in SESSION_STATUS_LABELS) {
    return SESSION_STATUS_LABELS[value as keyof typeof SESSION_STATUS_LABELS];
  }
  if (/^\d{4}-\d{2}-\d{2}T/.test(value)) return formatDate(value);
  return value;
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "150px minmax(0, 1fr)",
        gap: 12,
        padding: "8px 0",
        borderTop: "1px solid rgba(10,10,10,0.05)",
        fontSize: 13,
      }}
    >
      <span style={{ color: "#8a8580" }}>{label}</span>
      <span style={{ color: "#0a0a0a", minWidth: 0, overflowWrap: "anywhere" }}>
        {children}
      </span>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2
      style={{
        margin: "0 0 10px",
        fontSize: 11,
        fontWeight: 500,
        letterSpacing: 1.2,
        textTransform: "uppercase",
        color: "#8a8580",
        fontFamily: '"Geist Mono", monospace',
      }}
    >
      {children}
    </h2>
  );
}

export default async function AdminSimuladoDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  let detail: Awaited<ReturnType<typeof getAdminMockInterview>>;
  try {
    detail = await getAdminMockInterview(id);
  } catch (error) {
    if (error instanceof AdminMockInterviewApiError && error.status === 404) {
      notFound();
    }
    throw error;
  }

  return (
    <AdminPageWrap>
      <AdminShellHeader
        actions={
          <Link
            className={buttonVariants({ variant: "outline" })}
            href="/admin/simulados"
          >
            ← Voltar
          </Link>
        }
        eyebrow={`admin · entrevistas simuladas · #${detail.code}`}
        subtitle={`${detail.buyer.name || "Sem nome"} · ${detail.buyer.email}`}
        title={`Pedido #${detail.code}.`}
      />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))",
          gap: 16,
          alignItems: "start",
        }}
      >
        <div style={{ display: "grid", gap: 16 }}>
          <AdminCard>
            <SectionTitle>Sessão</SectionTitle>
            <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
              <AdminPill tone={sessionTone(detail.sessionStatus)}>
                {SESSION_STATUS_LABELS[detail.sessionStatus]}
              </AdminPill>
              {detail.reportSentAt && (
                <AdminPill tone="ok">Relatório enviado</AdminPill>
              )}
              {detail.rescheduleCount > 0 && (
                <AdminPill tone="neutral">
                  {detail.rescheduleCount} remarcaç
                  {detail.rescheduleCount === 1 ? "ão" : "ões"}
                </AdminPill>
              )}
            </div>
            <MockInterviewEditForm detail={detail} />
          </AdminCard>

          <AdminCard>
            <SectionTitle>Histórico</SectionTitle>
            {detail.events.length === 0 ? (
              <p style={{ margin: 0, fontSize: 13, color: "#8a8580" }}>
                Sem eventos.
              </p>
            ) : (
              <ol
                style={{
                  listStyle: "none",
                  margin: 0,
                  padding: 0,
                  display: "grid",
                  gap: 10,
                }}
              >
                {detail.events.map((event) => {
                  const from = describeValue(event.fromValue);
                  const to = describeValue(event.toValue);
                  return (
                    <li
                      key={event.id}
                      style={{
                        display: "grid",
                        gap: 2,
                        fontSize: 13,
                        paddingBottom: 10,
                        borderBottom: "1px solid rgba(10,10,10,0.05)",
                      }}
                    >
                      <span style={{ fontWeight: 500 }}>
                        {EVENT_LABELS[event.type] ?? event.type}
                        {from || to ? (
                          <span style={{ fontWeight: 400, color: "#6a6560" }}>
                            {" "}
                            {from ? `${from} → ` : ""}
                            {to ?? "—"}
                          </span>
                        ) : null}
                      </span>
                      {event.note && (
                        <span style={{ color: "#8a6014" }}>{event.note}</span>
                      )}
                      <span
                        style={{
                          color: "#a8a39d",
                          fontSize: 12,
                          fontFamily: '"Geist Mono", monospace',
                        }}
                      >
                        {formatDate(event.createdAt)} · {event.actor}
                      </span>
                    </li>
                  );
                })}
              </ol>
            )}
          </AdminCard>
        </div>

        <div style={{ display: "grid", gap: 16 }}>
          <AdminCard>
            <SectionTitle>Pagamento</SectionTitle>
            <Row label="Status">
              <AdminPill
                mono
                tone={
                  detail.paymentStatus === "paid"
                    ? "ok"
                    : detail.paymentStatus === "pending"
                      ? "warn"
                      : "danger"
                }
              >
                {PAYMENT_STATUS_LABELS[detail.paymentStatus]}
              </AdminPill>
            </Row>
            <Row label="Valor">{formatCents(detail.amountInCents)}</Row>
            <Row label="Forma">{detail.paymentMethod ?? "—"}</Row>
            <Row label="Pago em">{formatDate(detail.paidAt)}</Row>
            {detail.refundedAt && (
              <Row label="Estornado em">{formatDate(detail.refundedAt)}</Row>
            )}
            <Row label="ID no Mercado Pago">
              <span style={{ fontFamily: '"Geist Mono", monospace' }}>
                {detail.mpPaymentId ?? "—"}
              </span>
            </Row>
            <Row label="Origem">
              {ORIGIN_LABELS[detail.origin] ?? detail.origin}
            </Row>
            <Row label="Política aceita">
              {formatDate(detail.policyAcceptedAt)} (versão{" "}
              {detail.policyVersion})
            </Row>
          </AdminCard>

          <AdminCard>
            <SectionTitle>Reembolso</SectionTitle>
            <p style={{ margin: "0 0 8px", fontSize: 13 }}>
              <AdminPill tone={detail.refund.eligible ? "ok" : "neutral"}>
                {detail.refund.eligible ? "Tem direito" : "Sem direito"}
              </AdminPill>{" "}
              <span style={{ color: "#6a6560" }}>{detail.refund.reason}</span>
            </p>
            <p style={{ margin: 0, fontSize: 12.5, color: "#8a8580" }}>
              O estorno é feito no painel do Mercado Pago. Quando o Mercado Pago
              confirmar, este pedido muda para “Estornado” sozinho.
            </p>
          </AdminCard>

          {detail.application && (
            <AdminCard>
              <SectionTitle>Candidatura de origem</SectionTitle>
              <Row label="Vaga">
                {detail.application.jobTitle} · {detail.application.companyName}
              </Row>
              <Row label="Status">{detail.application.status}</Row>
              <Row label="Entrevista real">
                {formatDate(detail.application.nextActionAt)}
              </Row>
            </AdminCard>
          )}

          <AdminCard>
            <SectionTitle>E-mails da compra</SectionTitle>
            <Row label="Aviso de venda">
              {detail.notifications.adminNotifiedAt
                ? `Enviado em ${formatDate(detail.notifications.adminNotifiedAt)}`
                : (detail.notifications.adminNotifyError ?? "Pendente")}
            </Row>
            <Row label="Confirmação ao comprador">
              {detail.notifications.buyerNotifiedAt
                ? `Enviado em ${formatDate(detail.notifications.buyerNotifiedAt)}`
                : (detail.notifications.buyerNotifyError ?? "Pendente")}
            </Row>
          </AdminCard>
        </div>
      </div>
    </AdminPageWrap>
  );
}
