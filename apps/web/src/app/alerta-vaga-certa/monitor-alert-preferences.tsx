"use client";

import { useState } from "react";
import {
  type MonitorAlertPreference,
  updateMonitorAlertPreferences,
} from "@/lib/monitor-api";

const GEIST = "var(--font-geist), -apple-system, system-ui, sans-serif";
const MONO = "var(--font-geist-mono), monospace";

// Seção "Alertas" — deliberadamente pequena (spec da Fase 3: não virar uma
// central de preferências). A cadência de envio agora é definida pelo
// admin (ver /admin/alerta-vagas), não mais escolha do usuário — aqui só
// resta ligar/desligar o e-mail, aplicado otimisticamente.
export function MonitorAlertPreferences({
  initialPreference,
}: {
  initialPreference: MonitorAlertPreference | null;
}) {
  const [preference, setPreference] = useState(initialPreference);
  const [pending, setPending] = useState(false);

  if (!preference) return null;

  async function handleToggle() {
    if (pending || !preference) return;
    const previous = preference;
    const emailEnabled = !preference.emailEnabled;
    setPreference((current) =>
      current ? { ...current, emailEnabled } : current,
    );
    setPending(true);
    const updated = await updateMonitorAlertPreferences({ emailEnabled });
    setPending(false);
    if (!updated) {
      setPreference(previous);
    }
  }

  return (
    <div
      style={{
        background: "#fafaf6",
        border: "1px solid rgba(10,10,10,0.08)",
        borderRadius: 14,
        padding: "16px 18px",
        fontFamily: GEIST,
      }}
    >
      <p
        style={{
          fontFamily: MONO,
          fontSize: 10,
          fontWeight: 500,
          letterSpacing: 1,
          color: "#8a8a85",
          margin: "0 0 10px",
        }}
      >
        ALERTAS
      </p>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          fontSize: 13,
          color: "#3a3a38",
        }}
      >
        <span>E-mail</span>
        <button
          type="button"
          aria-pressed={preference.emailEnabled}
          disabled={pending}
          onClick={handleToggle}
          style={{
            padding: "6px 11px",
            borderRadius: 99,
            border: `1px solid ${preference.emailEnabled ? "#0a0a0a" : "rgba(10,10,10,0.12)"}`,
            background: preference.emailEnabled ? "#0a0a0a" : "#fff",
            color: preference.emailEnabled ? "#fafaf6" : "#3a3a38",
            fontSize: 11.5,
            fontFamily: GEIST,
            cursor: pending ? "default" : "pointer",
            opacity: pending ? 0.7 : 1,
          }}
        >
          {preference.emailEnabled ? "Ativado" : "Desativado"}
        </button>
      </div>
    </div>
  );
}
