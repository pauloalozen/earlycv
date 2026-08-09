"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { updateMyRadarProfile } from "@/lib/radar-api";

const GEIST = "var(--font-geist), -apple-system, system-ui, sans-serif";
const MONO = "var(--font-geist-mono), monospace";

// Os 13 valores editáveis do enum JobArea — OTHER fica de fora porque não
// faz sentido o usuário se autodeclarar "geral".
export const AREA_LABELS: Record<string, string> = {
  DATA_AI: "Dados & IA",
  SOFTWARE_ENGINEERING: "Engenharia de Software",
  CLOUD_DEVOPS: "Cloud & DevOps",
  CYBERSECURITY: "Segurança",
  PRODUCT: "Produto",
  DESIGN_UX: "Design & UX",
  QA_TEST: "QA & Testes",
  PROJECT_AGILE: "Projetos & Agile",
  ARCHITECTURE: "Arquitetura",
  LEADERSHIP: "Liderança Tech",
  GROWTH_MARKETING: "Growth & Marketing Digital",
  BUSINESS_ANALYTICS: "Business Analytics",
  CX_DIGITAL: "CX Digital",
};

export const SENIORITY_LABELS: Record<string, string> = {
  INTERN: "Estagiário",
  JUNIOR: "Júnior",
  MID: "Pleno",
  SENIOR: "Sênior",
  LEAD: "Lead",
  STAFF: "Staff",
  MANAGER: "Gerente",
  DIRECTOR: "Diretor",
  UNKNOWN: "Não definido",
};

function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  return (
    <div
      role="status"
      style={{
        position: "fixed",
        bottom: 20,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 100,
        background: "#0a0a0a",
        color: "#fafaf6",
        borderRadius: 10,
        padding: "12px 16px",
        display: "flex",
        alignItems: "center",
        gap: 12,
        maxWidth: "calc(100vw - 32px)",
        boxShadow: "0 8px 24px rgba(0,0,0,0.25)",
        fontFamily: GEIST,
        fontSize: 13,
      }}
    >
      <span>{message}</span>
      <button
        type="button"
        onClick={onClose}
        aria-label="Fechar"
        style={{
          background: "none",
          border: "none",
          color: "#8a8a85",
          cursor: "pointer",
          fontSize: 13,
          padding: 0,
        }}
      >
        ✕
      </button>
    </div>
  );
}

export function RadarProfileEditor({
  initialAreas,
  initialSeniority,
}: {
  initialAreas: string[];
  initialSeniority: string;
}) {
  const router = useRouter();
  const [areas, setAreas] = useState<string[]>(initialAreas);
  const [seniority, setSeniority] = useState(
    initialSeniority in SENIORITY_LABELS ? initialSeniority : "UNKNOWN",
  );
  const [pending, startTransition] = useTransition();
  const [toast, setToast] = useState<string | null>(null);

  function toggleArea(area: string) {
    setAreas((prev) =>
      prev.includes(area) ? prev.filter((a) => a !== area) : [...prev, area],
    );
  }

  function handleSave() {
    startTransition(async () => {
      const ok = await updateMyRadarProfile({ areas, seniority });
      if (ok) {
        setToast("Perfil atualizado");
        router.refresh();
      } else {
        setToast("Não foi possível salvar. Tente novamente.");
      }
    });
  }

  return (
    <div
      data-testid="radar-profile-editor"
      style={{
        background: "#fafaf6",
        border: "1px solid rgba(10,10,10,0.08)",
        borderRadius: 14,
        padding: "20px 22px",
        marginBottom: 24,
        fontFamily: GEIST,
      }}
    >
      <p
        style={{
          fontFamily: MONO,
          fontSize: 10.5,
          color: "#8a8a85",
          letterSpacing: 0.4,
          margin: "0 0 14px",
        }}
      >
        SEU PERFIL NO RADAR
      </p>

      <p
        style={{
          fontSize: 12,
          fontWeight: 500,
          color: "#3a3a38",
          margin: "0 0 8px",
        }}
      >
        Áreas
      </p>
      <div
        style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16 }}
      >
        {Object.entries(AREA_LABELS).map(([value, label]) => {
          const selected = areas.includes(value);
          return (
            <button
              key={value}
              type="button"
              aria-pressed={selected}
              onClick={() => toggleArea(value)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                background: selected ? "#0a0a0a" : "#fff",
                color: selected ? "#fafaf6" : "#3a3a38",
                border: `1px solid ${selected ? "#0a0a0a" : "rgba(10,10,10,0.12)"}`,
                borderRadius: 99,
                padding: "6px 12px",
                fontSize: 12,
                fontWeight: 500,
                cursor: "pointer",
                fontFamily: GEIST,
              }}
            >
              {label}
              {selected ? <span aria-hidden>×</span> : null}
            </button>
          );
        })}
      </div>

      <p
        style={{
          fontSize: 12,
          fontWeight: 500,
          color: "#3a3a38",
          margin: "0 0 8px",
        }}
      >
        Senioridade
      </p>
      <select
        aria-label="Senioridade"
        value={seniority}
        onChange={(e) => setSeniority(e.target.value)}
        style={{
          display: "block",
          width: "100%",
          maxWidth: 240,
          background: "#fff",
          border: "1px solid rgba(10,10,10,0.12)",
          borderRadius: 8,
          padding: "9px 12px",
          fontSize: 13,
          color: "#0a0a0a",
          fontFamily: GEIST,
          marginBottom: 18,
        }}
      >
        {Object.entries(SENIORITY_LABELS).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>

      <button
        type="button"
        data-testid="radar-profile-save-btn"
        onClick={handleSave}
        disabled={pending}
        style={{
          background: "#0a0a0a",
          color: "#fafaf6",
          border: "none",
          borderRadius: 8,
          padding: "10px 18px",
          fontSize: 13,
          fontWeight: 500,
          cursor: pending ? "default" : "pointer",
          opacity: pending ? 0.7 : 1,
          fontFamily: GEIST,
        }}
      >
        {pending ? "Salvando..." : "Salvar preferências"}
      </button>

      {toast ? <Toast message={toast} onClose={() => setToast(null)} /> : null}
    </div>
  );
}
