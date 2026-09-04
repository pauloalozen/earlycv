"use client";

import {
  RADAR_AREA_LABELS,
  RADAR_SENIORITY_LABELS,
} from "@/app/radar/radar-ui";
import type { MonitorProfile } from "@/lib/monitor-api";

const GEIST = "var(--font-geist), -apple-system, system-ui, sans-serif";
const MONO = "var(--font-geist-mono), monospace";

const WORK_MODEL_LABELS: Record<string, string> = {
  remote: "Remoto",
  hybrid: "Híbrido",
  onsite: "Presencial",
  flexible: "Flexível",
};

// Bloco A — "O que estou monitorando". Resumo compacto de UserRadarProfile,
// nunca a ficha completa: prioriza área/senioridade/skills/modelo de
// trabalho, o resto (idiomas, certificações, contrato) fica só no editor.
// A intenção é transmitir "existe um agente configurado", não uma tela de
// configurações densa.
export function MonitorProfileSummary({
  profile,
  onEdit,
}: {
  profile: MonitorProfile;
  onEdit: () => void;
}) {
  const areaLabels = profile.areas.map(
    (area) => RADAR_AREA_LABELS[area] ?? area,
  );
  const seniorityLabel = profile.seniority
    ? RADAR_SENIORITY_LABELS[profile.seniority]
    : "";
  const workModelLabels = profile.preferredWorkModels.map(
    (model) => WORK_MODEL_LABELS[model] ?? model,
  );
  const topSkills = profile.skills.slice(0, 8);

  return (
    <div
      style={{
        background: "#fafaf6",
        border: "1px solid rgba(10,10,10,0.08)",
        borderRadius: 16,
        padding: "20px 22px",
        fontFamily: GEIST,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <div style={{ minWidth: 0 }}>
          <p
            style={{
              fontFamily: MONO,
              fontSize: 10,
              fontWeight: 500,
              letterSpacing: 1,
              color: "#8a8a85",
              margin: "0 0 8px",
              display: "flex",
              alignItems: "center",
              gap: 7,
            }}
          >
            <span
              aria-hidden
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: "#2fa84c",
                display: "inline-block",
                boxShadow: "0 0 0 3px rgba(47,168,76,0.18)",
              }}
            />
            SEU ALERTA ESTÁ PROCURANDO
          </p>

          <p
            style={{
              margin: "0 0 6px",
              fontSize: 16,
              fontWeight: 500,
              letterSpacing: -0.2,
              color: "#0a0a0a",
            }}
          >
            {areaLabels.length > 0 ? areaLabels.join(" · ") : "Todas as áreas"}
            {seniorityLabel ? ` · ${seniorityLabel}` : ""}
          </p>

          {workModelLabels.length > 0 || profile.openToRelocation ? (
            <p style={{ margin: "0 0 10px", fontSize: 13, color: "#6a6560" }}>
              {workModelLabels.join(" + ")}
              {profile.openToRelocation
                ? `${workModelLabels.length > 0 ? " · " : ""}aberto a relocação`
                : ""}
            </p>
          ) : null}

          {topSkills.length > 0 ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {topSkills.map((skill) => (
                <span
                  key={skill}
                  style={{
                    fontSize: 11.5,
                    color: "#3a3a38",
                    background: "rgba(10,10,10,0.05)",
                    borderRadius: 5,
                    padding: "3px 8px",
                  }}
                >
                  {skill}
                </span>
              ))}
            </div>
          ) : null}
        </div>

        <button
          type="button"
          onClick={onEdit}
          style={{
            flexShrink: 0,
            padding: "9px 15px",
            borderRadius: 9,
            border: "1px solid rgba(10,10,10,0.12)",
            background: "#fff",
            color: "#0a0a0a",
            fontSize: 12.5,
            fontWeight: 500,
            fontFamily: GEIST,
            cursor: "pointer",
            whiteSpace: "nowrap",
          }}
        >
          Editar monitoramento
        </button>
      </div>
    </div>
  );
}
