import Link from "next/link";

import {
  AdminCard,
  AdminPageWrap,
  AdminSectionGroup,
  AdminTable,
  AdminTd,
  AdminTh,
  AT,
} from "@/app/admin/_components/admin-primitives";
import { AdminShellHeader } from "@/app/admin/_components/admin-shell-header";
import { getEmailDispatch } from "@/lib/admin-emails-api";
import { getBackofficeSessionToken } from "@/lib/backoffice-session.server";
import { buildAdminMetadata } from "@/lib/route-metadata";
import {
  fmtDate,
  KIND_LABEL,
  reasonLabel,
  StatusPill,
} from "../../_components/email-labels";
import {
  MissingTokenState,
  UnexpectedErrorState,
} from "../../_components/page-states";

export const metadata = buildAdminMetadata("Emails — Envio");

const EVENT_LABEL: Record<string, string> = {
  SENT: "Aceito pelo SES",
  DELIVERED: "Entregue",
  BOUNCED: "Bounce",
  COMPLAINED: "Complaint",
  REJECTED: "Rejeitado",
};

export default async function AdminEmailsDispatchDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const path = `/admin/emails/envios/${id}`;
  const token = await getBackofficeSessionToken();
  if (!token) return <MissingTokenState path={path} />;

  let dispatch: Awaited<ReturnType<typeof getEmailDispatch>>;
  try {
    dispatch = await getEmailDispatch(id, token);
  } catch {
    return <UnexpectedErrorState path={path} />;
  }

  const backHref =
    dispatch.kind === "PURCHASE_CONFIRMATION"
      ? "/admin/emails/compras"
      : "/admin/emails/relacionamento";

  const rows: Array<[string, string]> = [
    ["Destinatário", dispatch.recipientEmail],
    ["Agendado para", fmtDate(dispatch.scheduledFor)],
    ["Expira em", fmtDate(dispatch.expiresAt)],
    ["Enviado em", fmtDate(dispatch.sentAt)],
    ["Tentativas", String(dispatch.attempts)],
    ["Provider", dispatch.provider === "SES" ? "Amazon SES" : "Resend"],
    ["Id do provider", dispatch.providerMessageId ?? "—"],
    ["Variante", dispatch.variant ?? "—"],
    ["Motivo", reasonLabel(dispatch.skippedReason)],
    ["Último erro", dispatch.lastError ?? "—"],
    ["Compra", dispatch.referenceId ?? "—"],
    ["Teste explícito", dispatch.isTest ? "Sim" : "Não"],
  ];

  return (
    <AdminPageWrap>
      <AdminShellHeader
        eyebrow="Emails"
        title={KIND_LABEL[dispatch.kind]}
        subtitle={`Envio ${dispatch.id} · criado em ${fmtDate(dispatch.createdAt)}`}
        actions={
          <Link href={backHref} style={{ fontSize: 12.5 }}>
            ← Voltar
          </Link>
        }
      />

      <AdminSectionGroup label="Envio">
        <AdminCard>
          <div style={{ marginBottom: 12 }}>
            <StatusPill status={dispatch.status} />
          </div>
          <dl
            style={{
              display: "grid",
              gridTemplateColumns: "180px 1fr",
              gap: "8px 16px",
              fontSize: 13,
            }}
          >
            {rows.map(([label, value]) => (
              <div key={label} style={{ display: "contents" }}>
                <dt style={{ color: AT.muted }}>{label}</dt>
                <dd style={{ margin: 0, wordBreak: "break-all" }}>{value}</dd>
              </div>
            ))}
          </dl>
        </AdminCard>
      </AdminSectionGroup>

      <AdminSectionGroup label="Eventos de entrega">
        <AdminCard>
          {dispatch.events.length === 0 ? (
            <p style={{ fontSize: 13, color: AT.muted }}>
              Nenhum evento registrado (envios de compra via Resend não têm
              webhook de entrega; relacionamento recebe Send/Delivery/Bounce/
              Complaint pelo SES).
            </p>
          ) : (
            <AdminTable>
              <thead>
                <tr>
                  <AdminTh>Evento</AdminTh>
                  <AdminTh>Quando</AdminTh>
                </tr>
              </thead>
              <tbody>
                {dispatch.events.map((event) => (
                  <tr key={event.id}>
                    <AdminTd>{EVENT_LABEL[event.type] ?? event.type}</AdminTd>
                    <AdminTd>{fmtDate(event.occurredAt)}</AdminTd>
                  </tr>
                ))}
              </tbody>
            </AdminTable>
          )}
        </AdminCard>
      </AdminSectionGroup>
    </AdminPageWrap>
  );
}
