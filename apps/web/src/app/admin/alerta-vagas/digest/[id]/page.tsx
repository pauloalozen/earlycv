import Link from "next/link";
import { notFound } from "next/navigation";

import {
  AdminCard,
  AdminPageWrap,
  AdminPill,
  AT,
} from "@/app/admin/_components/admin-primitives";
import { AdminShellHeader } from "@/app/admin/_components/admin-shell-header";
import { AdminTokenState } from "@/app/admin/_components/admin-token-state";
import {
  type DigestTimeline,
  type EmailProviderName,
  getMonitorDigestTimeline,
} from "@/lib/admin-monitor-api";
import { buildAdminStateModel } from "@/lib/admin-state";
import { getBackofficeSessionToken } from "@/lib/backoffice-session.server";
import { buildAdminMetadata } from "@/lib/route-metadata";

export const metadata = buildAdminMetadata("Linha do tempo do digest");

const PROVIDER_LABEL: Record<EmailProviderName, string> = {
  RESEND: "Resend",
  SES: "SES",
};

const STATUS_TONE: Record<
  string,
  "ok" | "danger" | "warn" | "info" | "neutral"
> = {
  SENT: "ok",
  FAILED: "danger",
  SKIPPED: "warn",
  PENDING: "info",
  PROCESSING: "info",
  OUTCOME_UNKNOWN: "warn",
};

const EVENT_TONE: Record<
  string,
  "ok" | "danger" | "warn" | "info" | "neutral"
> = {
  SENT: "info",
  DELIVERED: "ok",
  OPENED: "neutral",
  CLICKED: "ok",
  BOUNCED: "danger",
  COMPLAINED: "danger",
  REJECTED: "danger",
};

function fmtDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString("pt-BR");
}

export default async function AdminDigestTimelinePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const token = await getBackofficeSessionToken();

  if (!token) {
    const state = buildAdminStateModel("missing-token", "/admin/alerta-vagas");
    return (
      <div className="px-6 py-10 md:px-10">
        <AdminTokenState {...state} />
      </div>
    );
  }

  let timeline: DigestTimeline;
  try {
    timeline = await getMonitorDigestTimeline(id, token);
  } catch (err) {
    if (err instanceof Error && err.message.includes("API 404")) {
      notFound();
    }
    const state = buildAdminStateModel(
      "unexpected-error",
      "/admin/alerta-vagas",
    );
    return (
      <div className="px-6 py-10 md:px-10">
        <AdminTokenState {...state} />
      </div>
    );
  }

  const { digest, events } = timeline;

  return (
    <AdminPageWrap maxWidth={860}>
      <div style={{ marginBottom: 16 }}>
        <Link
          href="/admin/alerta-vagas"
          style={{ fontSize: 12.5, color: AT.muted, textDecoration: "none" }}
        >
          ← Alerta de Vagas
        </Link>
      </div>

      <AdminShellHeader
        eyebrow="Radar Oportunidades"
        title="Linha do tempo do digest"
        subtitle={`${digest.user.name} (${digest.user.email})`}
      />

      <AdminCard>
        <div
          style={{
            display: "flex",
            gap: 24,
            flexWrap: "wrap",
            marginBottom: 4,
          }}
        >
          <Field
            label="Status"
            value={
              <AdminPill tone={STATUS_TONE[digest.status] ?? "neutral"}>
                {digest.status.toLowerCase()}
              </AdminPill>
            }
          />
          <Field
            label="Provider"
            value={
              <AdminPill tone="dark" mono>
                {PROVIDER_LABEL[digest.provider]}
              </AdminPill>
            }
          />
          <Field
            label="Origem"
            value={digest.source === "ADMIN_MANUAL" ? "manual" : "automático"}
          />
          <Field label="Tentativas" value={String(digest.attempts)} />
          <Field label="Criado em" value={fmtDate(digest.createdAt)} />
          <Field label="Enviado em" value={fmtDate(digest.sentAt)} />
          {digest.outcomeUnknownAt && (
            <Field
              label="Resultado desconhecido desde"
              value={fmtDate(digest.outcomeUnknownAt)}
            />
          )}
          {digest.providerMessageId && (
            <Field
              label="Message ID (truncado)"
              value={digest.providerMessageId}
              mono
            />
          )}
          {digest.lastError && (
            <Field
              label="Último erro (truncado)"
              value={digest.lastError}
              mono
            />
          )}
        </div>
      </AdminCard>

      <div style={{ marginTop: 28, marginBottom: 12 }}>
        <h2
          style={{
            fontSize: 15,
            fontWeight: 600,
            color: AT.ink,
            margin: "0 0 3px",
          }}
        >
          Eventos ({events.length})
        </h2>
        <p
          style={{ fontSize: 12.5, color: AT.muted, margin: 0, maxWidth: 640 }}
        >
          Ordem cronológica de confirmação do envio pelo provider. "Aceito pelo
          provider" é uma confirmação assíncrona de recebimento, não de entrega
          — entrega/abertura/clique dependem de o provider notificar o webhook.
        </p>
      </div>

      {events.length === 0 && (
        <AdminCard>
          <span style={{ color: AT.muted, fontSize: 13 }}>
            Nenhum evento de webhook recebido ainda para este digest.
          </span>
        </AdminCard>
      )}

      {events.length > 0 && (
        <ol style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {events.map((event, index) => (
            <li
              key={event.id}
              style={{
                display: "flex",
                gap: 14,
                paddingBottom: 16,
              }}
            >
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                }}
              >
                <span
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: "50%",
                    background: AT.ink,
                    marginTop: 4,
                  }}
                />
                {index < events.length - 1 && (
                  <span
                    style={{
                      width: 1,
                      flex: 1,
                      background: AT.border,
                      marginTop: 4,
                    }}
                  />
                )}
              </div>
              <div style={{ flex: 1, minWidth: 0, paddingBottom: 4 }}>
                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    alignItems: "baseline",
                    flexWrap: "wrap",
                  }}
                >
                  <AdminPill tone={EVENT_TONE[event.type] ?? "neutral"}>
                    {event.label}
                  </AdminPill>
                  <AdminPill tone="dark" mono>
                    {PROVIDER_LABEL[event.provider]}
                  </AdminPill>
                  <span
                    style={{
                      fontSize: 11,
                      color: AT.muted,
                      fontFamily: '"Geist Mono", monospace',
                    }}
                  >
                    {fmtDate(event.occurredAt)}
                  </span>
                </div>
                {event.summary && (
                  <div style={{ fontSize: 12.5, color: AT.ink2, marginTop: 4 }}>
                    {event.summary}
                  </div>
                )}
                {event.providerEventId && (
                  <div
                    style={{
                      fontSize: 10.5,
                      color: AT.faint,
                      marginTop: 2,
                      fontFamily: '"Geist Mono", monospace',
                    }}
                  >
                    event_id: {event.providerEventId}
                  </div>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
    </AdminPageWrap>
  );
}

function Field({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div style={{ minWidth: 140 }}>
      <div
        style={{
          fontFamily: '"Geist Mono", monospace',
          fontSize: 10,
          letterSpacing: 1.1,
          color: AT.muted2,
          fontWeight: 500,
          textTransform: "uppercase",
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: mono ? 11.5 : 13,
          color: AT.ink2,
          fontFamily: mono ? '"Geist Mono", monospace' : '"Geist", sans-serif',
          wordBreak: "break-all",
        }}
      >
        {value}
      </div>
    </div>
  );
}
