"use client";

import { useState } from "react";
import {
  type MonitorAlertFrequency,
  type MonitorAlertPreference,
  updateMonitorAlertPreferences,
} from "@/lib/monitor-api";

const GEIST = "var(--font-geist), -apple-system, system-ui, sans-serif";
const MONO = "var(--font-geist-mono), monospace";

const FREQUENCY_OPTIONS: { value: MonitorAlertFrequency; label: string }[] = [
  { value: "DAILY", label: "Diariamente" },
  { value: "WEEKLY", label: "Semanalmente" },
  { value: "OFF", label: "Desativado" },
];

// Seção "Alertas" — deliberadamente pequena (spec da Fase 3: não virar uma
// central de preferências). Só o essencial: e-mail ligado/desligado e
// frequência. Sem modal — a troca de frequência já é a própria ação,
// aplicada otimisticamente.
export function MonitorAlertPreferences({
  initialPreference,
}: {
  initialPreference: MonitorAlertPreference | null;
}) {
  const [preference, setPreference] = useState(initialPreference);
  const [pending, setPending] = useState(false);

  if (!preference) return null;

  async function handleFrequencyChange(frequency: MonitorAlertFrequency) {
    if (frequency === preference?.frequency || pending) return;
    const previous = preference;
    setPreference((current) => (current ? { ...current, frequency } : current));
    setPending(true);
    const updated = await updateMonitorAlertPreferences({ frequency });
    setPending(false);
    if (!updated) {
      setPreference(previous);
    }
  }

  const frequencyLabel =
    FREQUENCY_OPTIONS.find((option) => option.value === preference.frequency)
      ?.label ?? preference.frequency;

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
          marginBottom: 10,
          fontSize: 13,
          color: "#3a3a38",
        }}
      >
        <span>E-mail</span>
        <strong
          style={{
            color: preference.frequency === "OFF" ? "#8a8a85" : "#1f7a34",
          }}
        >
          {preference.frequency === "OFF" ? "Desativado" : "Ativado"}
        </strong>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          marginBottom: 12,
          fontSize: 13,
          color: "#3a3a38",
        }}
      >
        <span>Frequência</span>
        <strong>{frequencyLabel}</strong>
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {FREQUENCY_OPTIONS.map((option) => {
          const active = option.value === preference.frequency;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={active}
              disabled={pending}
              onClick={() => handleFrequencyChange(option.value)}
              style={{
                padding: "6px 11px",
                borderRadius: 99,
                border: `1px solid ${active ? "#0a0a0a" : "rgba(10,10,10,0.12)"}`,
                background: active ? "#0a0a0a" : "#fff",
                color: active ? "#fafaf6" : "#3a3a38",
                fontSize: 11.5,
                fontFamily: GEIST,
                cursor: pending ? "default" : "pointer",
                opacity: pending ? 0.7 : 1,
              }}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
