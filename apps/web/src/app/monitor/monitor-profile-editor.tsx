"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  RADAR_AREA_LABELS,
  RADAR_SENIORITY_LABELS,
} from "@/app/radar/radar-ui";
import { trackEvent } from "@/lib/analytics-tracking";
import { type MonitorProfile, updateMonitorProfile } from "@/lib/monitor-api";
import { getMonitorProductOrigin } from "./monitor-attribution";

const GEIST = "var(--font-geist), -apple-system, system-ui, sans-serif";
const MONO = "var(--font-geist-mono), monospace";

const AREA_OPTIONS = Object.entries(RADAR_AREA_LABELS).filter(
  ([value]) => value !== "OTHER",
);
const SENIORITY_OPTIONS = Object.entries(RADAR_SENIORITY_LABELS).filter(
  ([value]) => value !== "UNKNOWN",
);
const WORK_MODEL_OPTIONS: { value: string; label: string }[] = [
  { value: "remote", label: "Remoto" },
  { value: "hybrid", label: "Híbrido" },
  { value: "onsite", label: "Presencial" },
  { value: "flexible", label: "Flexível" },
];
// Sem "Ambos" de propósito: como preferência do perfil, nada selecionado
// já significa "qualquer tipo de contrato" (ver preferredContractTypes em
// matching.engine.ts — filtro só entra em vigor com lista não-vazia).
// "BOTH" é um valor de ContractType do lado da VAGA (a vaga aceita CLT ou
// PJ) — usá-lo aqui como preferência restringiria a match só com vagas
// literalmente marcadas "BOTH", o oposto de "aceito qualquer um".
const CONTRACT_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: "CLT", label: "CLT" },
  { value: "PJ", label: "PJ" },
];

function chipStyle(active: boolean): React.CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    padding: "7px 12px",
    borderRadius: 99,
    border: `1px solid ${active ? "#0a0a0a" : "rgba(10,10,10,0.12)"}`,
    background: active ? "#0a0a0a" : "#fff",
    color: active ? "#fafaf6" : "#3a3a38",
    fontSize: 12.5,
    fontFamily: GEIST,
    cursor: "pointer",
    fontWeight: active ? 500 : 400,
  };
}

function toggle(list: string[], value: string): string[] {
  return list.includes(value)
    ? list.filter((v) => v !== value)
    : [...list, value];
}

export type MonitorProfileEditorProps = {
  open: boolean;
  profile: MonitorProfile;
  onClose: () => void;
  onSaved: (profile: MonitorProfile) => void;
};

// Formulário de edição do que o Monitor usa pra pontuar vagas — só os
// campos que UpdateRadarProfileDto realmente aceita (areas, seniority,
// preferredWorkModels, preferredContractTypes). skills/languages/
// certifications/openToRelocation vêm do CV automaticamente e são exibidos
// como contexto (read-only) — editá-los exigiria estender o DTO do
// backend, fora do escopo desta fase de frontend.
export function MonitorProfileEditor({
  open,
  profile,
  onClose,
  onSaved,
}: MonitorProfileEditorProps) {
  const [isClient, setIsClient] = useState(false);
  const [areas, setAreas] = useState<string[]>(profile.areas);
  const [seniority, setSeniority] = useState(profile.seniority);
  const [workModels, setWorkModels] = useState<string[]>(
    profile.preferredWorkModels,
  );
  const [contractTypes, setContractTypes] = useState<string[]>(
    profile.preferredContractTypes,
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const headingId = useId();

  useEffect(() => setIsClient(true), []);

  useEffect(() => {
    if (!open) return;
    setAreas(profile.areas);
    setSeniority(profile.seniority);
    setWorkModels(profile.preferredWorkModels);
    setContractTypes(profile.preferredContractTypes);
    setError(null);
    void trackEvent({
      eventName: "monitor_profile_viewed",
      eventVersion: 1,
      properties: { product_origin: getMonitorProductOrigin() },
    });
  }, [open, profile]);

  useEffect(() => {
    if (!open) return;
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  if (!isClient || !open) return null;

  async function handleSave() {
    setSaving(true);
    setError(null);
    const updated = await updateMonitorProfile({
      areas,
      seniority,
      preferredWorkModels: workModels,
      preferredContractTypes: contractTypes,
    });
    setSaving(false);
    if (!updated) {
      setError("Não deu pra salvar agora. Tenta de novo em instantes.");
      return;
    }
    onSaved(updated);
    onClose();
  }

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={headingId}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 200,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        aria-hidden
        onClick={onClose}
        style={{
          position: "absolute",
          inset: 0,
          background: "rgba(10,10,10,0.45)",
          backdropFilter: "blur(4px)",
        }}
      />

      <div
        ref={dialogRef}
        className="monitor-profile-editor-dialog"
        style={{
          position: "relative",
          zIndex: 1,
          background: "#fafaf6",
          border: "1px solid rgba(10,10,10,0.10)",
          borderRadius: 18,
          padding: "24px 28px 22px",
          width: "100%",
          maxWidth: 620,
          maxHeight: "92dvh",
          overflowY: "auto",
          scrollbarWidth: "none",
          boxShadow: "0 32px 80px -20px rgba(10,10,10,0.5)",
          fontFamily: GEIST,
        }}
      >
        <style>{`.monitor-profile-editor-dialog::-webkit-scrollbar { display: none; }`}</style>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            marginBottom: 4,
          }}
        >
          <div>
            <h2
              id={headingId}
              style={{
                margin: "0 0 4px",
                fontSize: 19,
                fontWeight: 600,
                letterSpacing: -0.4,
                color: "#0a0a0a",
              }}
            >
              Editar monitoramento
            </h2>
            <p style={{ margin: 0, fontSize: 12.5, color: "#6a6560" }}>
              Esse perfil foi criado automaticamente a partir do seu CV — você
              pode ajustar o que o Monitor usa para procurar vagas.
            </p>
          </div>
          <button
            type="button"
            aria-label="Fechar"
            onClick={onClose}
            style={{
              border: "none",
              background: "transparent",
              cursor: "pointer",
              color: "#8a8a85",
              padding: 4,
            }}
          >
            <svg
              aria-hidden
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
            >
              <title>Fechar</title>
              <path
                d="M18 6L6 18M6 6l12 12"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        <section style={{ marginTop: 18 }}>
          <p
            style={{
              fontFamily: MONO,
              fontSize: 10,
              fontWeight: 500,
              letterSpacing: 1,
              color: "#8a8a85",
              margin: "0 0 8px",
            }}
          >
            ÁREAS
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
            {AREA_OPTIONS.map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={areas.includes(value)}
                onClick={() => setAreas((current) => toggle(current, value))}
                style={chipStyle(areas.includes(value))}
              >
                {label}
              </button>
            ))}
          </div>
        </section>

        <section style={{ marginTop: 18 }}>
          <p
            style={{
              fontFamily: MONO,
              fontSize: 10,
              fontWeight: 500,
              letterSpacing: 1,
              color: "#8a8a85",
              margin: "0 0 8px",
            }}
          >
            SENIORIDADE
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
            {SENIORITY_OPTIONS.map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={seniority === value}
                onClick={() => setSeniority(value)}
                style={chipStyle(seniority === value)}
              >
                {label}
              </button>
            ))}
          </div>
        </section>

        <section style={{ marginTop: 18 }}>
          <p
            style={{
              fontFamily: MONO,
              fontSize: 10,
              fontWeight: 500,
              letterSpacing: 1,
              color: "#8a8a85",
              margin: "0 0 8px",
            }}
          >
            MODELO DE TRABALHO
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
            {WORK_MODEL_OPTIONS.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                aria-pressed={workModels.includes(value)}
                onClick={() =>
                  setWorkModels((current) => toggle(current, value))
                }
                style={chipStyle(workModels.includes(value))}
              >
                {label}
              </button>
            ))}
          </div>
        </section>

        <section style={{ marginTop: 18 }}>
          <p
            style={{
              fontFamily: MONO,
              fontSize: 10,
              fontWeight: 500,
              letterSpacing: 1,
              color: "#8a8a85",
              margin: "0 0 8px",
            }}
          >
            TIPO DE CONTRATO
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
            {CONTRACT_TYPE_OPTIONS.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                aria-pressed={contractTypes.includes(value)}
                onClick={() =>
                  setContractTypes((current) => toggle(current, value))
                }
                style={chipStyle(contractTypes.includes(value))}
              >
                {label}
              </button>
            ))}
          </div>
          <p style={{ fontSize: 11, color: "#8a8a85", margin: "8px 0 0" }}>
            Nada selecionado = qualquer tipo de contrato.
          </p>
        </section>

        {profile.skills.length > 0 ? (
          <section style={{ marginTop: 18 }}>
            <p
              style={{
                fontFamily: MONO,
                fontSize: 10,
                fontWeight: 500,
                letterSpacing: 1,
                color: "#8a8a85",
                margin: "0 0 8px",
              }}
            >
              SKILLS IDENTIFICADAS NO SEU CV
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {profile.skills.slice(0, 24).map((skill) => (
                <span
                  key={skill}
                  style={{
                    fontSize: 11.5,
                    color: "#6a6560",
                    background: "rgba(10,10,10,0.04)",
                    borderRadius: 5,
                    padding: "3px 8px",
                  }}
                >
                  {skill}
                </span>
              ))}
            </div>
            <p style={{ fontSize: 11, color: "#8a8a85", margin: "8px 0 0" }}>
              Skills e idiomas vêm direto do seu CV e não são editáveis por
              aqui.
            </p>
          </section>
        ) : null}

        {error ? (
          <p style={{ color: "#c0392b", fontSize: 12.5, marginTop: 14 }}>
            {error}
          </p>
        ) : null}

        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 10,
            marginTop: 24,
            paddingTop: 16,
            borderTop: "1px solid rgba(10,10,10,0.06)",
          }}
        >
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            style={{
              padding: "10px 16px",
              borderRadius: 9,
              border: "1px solid rgba(10,10,10,0.12)",
              background: "#fafaf6",
              color: "#0a0a0a",
              fontSize: 13,
              fontFamily: GEIST,
              cursor: saving ? "default" : "pointer",
            }}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || areas.length === 0}
            style={{
              padding: "10px 18px",
              borderRadius: 9,
              border: "none",
              background: "#0a0a0a",
              color: "#fafaf6",
              fontSize: 13,
              fontWeight: 500,
              fontFamily: GEIST,
              cursor: saving || areas.length === 0 ? "default" : "pointer",
              opacity: saving || areas.length === 0 ? 0.7 : 1,
            }}
          >
            {saving ? "Salvando..." : "Salvar monitoramento"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
