"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type {
  AdminMockInterviewDetail,
  AdminMockInterviewInviteOutcome,
  AdminMockInterviewUpdate,
  MockInterviewSessionStatus,
} from "@/lib/admin-mock-interviews-api";
import {
  resendMockInterviewInviteAction,
  updateMockInterviewAction,
} from "../_actions/update";

const STATUS_OPTIONS: {
  value: Exclude<MockInterviewSessionStatus, "REFUNDED">;
  label: string;
}[] = [
  { value: "AWAITING_SCHEDULING", label: "Aguardando agenda" },
  { value: "SCHEDULED", label: "Agendada" },
  { value: "COMPLETED", label: "Realizada" },
  { value: "NO_SHOW", label: "Não compareceu" },
  { value: "CANCELLED", label: "Cancelada" },
];

// <input type="datetime-local"> trabalha no fuso do navegador (o do Paulo,
// Brasília). Converte o ISO salvo para "YYYY-MM-DDTHH:mm" local e volta.
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

const fieldStyle: React.CSSProperties = {
  height: 36,
  borderRadius: 8,
  border: "1px solid rgba(10,10,10,0.12)",
  background: "#fff",
  padding: "0 10px",
  fontSize: 13,
  color: "#0a0a0a",
  width: "100%",
  boxSizing: "border-box",
};

const labelStyle: React.CSSProperties = {
  display: "grid",
  gap: 6,
  fontSize: 12,
  fontWeight: 500,
  color: "#2a2620",
};

// Mensagem depois de salvar, incluindo o convite por e-mail ao comprador.
function describeSaveResult(invite: AdminMockInterviewInviteOutcome): {
  tone: "ok" | "error";
  text: string;
} {
  if (!invite) return { tone: "ok", text: "Salvo." };
  if (invite.status === "sent") {
    return {
      tone: "ok",
      text: "Salvo. Convite enviado por e-mail ao comprador.",
    };
  }
  if (invite.status === "skipped_missing_link") {
    return {
      tone: "error",
      text: "Salvo, mas o convite NÃO foi enviado: falta o link da chamada.",
    };
  }
  if (invite.status === "skipped_past") {
    return {
      tone: "ok",
      text: "Salvo. Horário no passado: nenhum convite enviado.",
    };
  }
  return {
    tone: "error",
    text: `Salvo, mas o convite falhou${invite.error ? `: ${invite.error}` : ""}. Use "Reenviar convite" para tentar de novo.`,
  };
}

export function MockInterviewEditForm({
  detail,
}: {
  detail: AdminMockInterviewDetail;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{
    tone: "ok" | "error";
    text: string;
  } | null>(null);

  const locked =
    detail.paymentStatus !== "paid" || detail.sessionStatus === "REFUNDED";
  const initialStatus =
    detail.sessionStatus === "REFUNDED"
      ? "AWAITING_SCHEDULING"
      : detail.sessionStatus;

  const [scheduledAt, setScheduledAt] = useState(
    toLocalInput(detail.scheduledAt),
  );
  const [meetingUrl, setMeetingUrl] = useState(detail.meetingUrl ?? "");
  const [sessionStatus, setSessionStatus] = useState(initialStatus);
  const [adminNotes, setAdminNotes] = useState(detail.adminNotes ?? "");
  const [reportSent, setReportSent] = useState(Boolean(detail.reportSentAt));

  // Reenvio manual do convite: só com a sessão salva como agendada, com
  // link e data futura (mesmas regras da API).
  const canResendInvite =
    !locked &&
    detail.sessionStatus === "SCHEDULED" &&
    Boolean(detail.meetingUrl) &&
    Boolean(detail.scheduledAt) &&
    new Date(detail.scheduledAt as string).getTime() > Date.now();

  function resendInvite() {
    startTransition(async () => {
      const result = await resendMockInterviewInviteAction(detail.id);
      if (result.ok) {
        setMessage(
          result.invite?.status === "sent"
            ? { tone: "ok", text: "Convite reenviado por e-mail ao comprador." }
            : describeSaveResult(result.invite),
        );
        router.refresh();
      } else {
        setMessage({ tone: "error", text: result.message });
      }
    });
  }

  function save() {
    const body: AdminMockInterviewUpdate = {};
    const nextScheduledIso = scheduledAt
      ? new Date(scheduledAt).toISOString()
      : null;
    if (nextScheduledIso !== detail.scheduledAt) {
      body.scheduledAt = nextScheduledIso;
    }
    if ((meetingUrl.trim() || null) !== detail.meetingUrl) {
      body.meetingUrl = meetingUrl.trim() || null;
    }
    // Agendar sozinho já move para "Agendada" no backend; só manda o status
    // quando o admin escolheu outro explicitamente.
    if (sessionStatus !== initialStatus) {
      body.sessionStatus = sessionStatus;
    }
    if ((adminNotes.trim() || null) !== detail.adminNotes) {
      body.adminNotes = adminNotes.trim() || null;
    }
    if (reportSent !== Boolean(detail.reportSentAt)) {
      body.reportSent = reportSent;
    }
    if (Object.keys(body).length === 0) {
      setMessage({ tone: "ok", text: "Nada mudou." });
      return;
    }

    startTransition(async () => {
      const result = await updateMockInterviewAction(detail.id, body);
      if (result.ok) {
        setMessage(describeSaveResult(result.invite));
        router.refresh();
      } else {
        setMessage({ tone: "error", text: result.message });
      }
    });
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
      style={{ display: "grid", gap: 16 }}
    >
      {locked && (
        <p
          style={{
            margin: 0,
            fontSize: 13,
            color: "#8a6014",
            background: "#f5ead0",
            borderRadius: 8,
            padding: "10px 12px",
          }}
        >
          {detail.sessionStatus === "REFUNDED"
            ? "Compra estornada: nada mais pode ser alterado."
            : "Pagamento ainda não confirmado: a sessão só pode ser agendada depois que o pagamento for aprovado."}
        </p>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 14,
        }}
      >
        <label htmlFor="mi-scheduled-at" style={labelStyle}>
          Data e hora da sessão (seu fuso)
          <input
            disabled={locked}
            id="mi-scheduled-at"
            onChange={(event) => setScheduledAt(event.target.value)}
            style={fieldStyle}
            type="datetime-local"
            value={scheduledAt}
          />
        </label>
        <label htmlFor="mi-status" style={labelStyle}>
          Status da sessão
          <select
            disabled={locked}
            id="mi-status"
            onChange={(event) =>
              setSessionStatus(event.target.value as typeof sessionStatus)
            }
            style={fieldStyle}
            value={sessionStatus}
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label htmlFor="mi-meeting-url" style={labelStyle}>
        Link do Google Meet (aparece para o comprador na página do pedido)
        <input
          disabled={locked}
          id="mi-meeting-url"
          onChange={(event) => setMeetingUrl(event.target.value)}
          placeholder="https://meet.google.com/..."
          style={fieldStyle}
          type="url"
          value={meetingUrl}
        />
      </label>

      <label
        htmlFor="mi-report-sent"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontSize: 13,
          color: "#2a2620",
        }}
      >
        <input
          checked={reportSent}
          disabled={locked}
          id="mi-report-sent"
          onChange={(event) => setReportSent(event.target.checked)}
          type="checkbox"
        />
        Relatório formal enviado ao comprador
      </label>

      <label htmlFor="mi-notes" style={labelStyle}>
        Anotações internas (o comprador não vê)
        <textarea
          id="mi-notes"
          onChange={(event) => setAdminNotes(event.target.value)}
          rows={5}
          style={{
            ...fieldStyle,
            height: "auto",
            padding: 10,
            resize: "vertical",
          }}
          value={adminNotes}
        />
      </label>

      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button
          disabled={pending}
          style={{
            background: "#0a0a0a",
            color: "#fafaf6",
            border: 0,
            borderRadius: 8,
            padding: "10px 16px",
            fontSize: 13,
            fontWeight: 500,
            cursor: pending ? "default" : "pointer",
            opacity: pending ? 0.6 : 1,
          }}
          type="submit"
        >
          {pending ? "Salvando..." : "Salvar alterações"}
        </button>
        {canResendInvite && (
          <button
            disabled={pending}
            onClick={resendInvite}
            style={{
              background: "transparent",
              color: "#0a0a0a",
              border: "1px solid rgba(10,10,10,0.2)",
              borderRadius: 8,
              padding: "9px 14px",
              fontSize: 13,
              fontWeight: 500,
              cursor: pending ? "default" : "pointer",
              opacity: pending ? 0.6 : 1,
            }}
            type="button"
          >
            Reenviar convite
          </button>
        )}
        {message && (
          <span
            role="status"
            style={{
              fontSize: 13,
              color: message.tone === "ok" ? "#1f7a4d" : "#9b2c2c",
            }}
          >
            {message.text}
          </span>
        )}
      </div>
    </form>
  );
}
