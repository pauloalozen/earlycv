"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { updateMyRadarProfile } from "@/lib/radar-api";

const GEIST = "var(--font-geist), -apple-system, system-ui, sans-serif";

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
        zIndex: 220,
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
  const [open, setOpen] = useState(false);
  const [isClient, setIsClient] = useState(false);
  const [shouldRender, setShouldRender] = useState(false);
  const [visible, setVisible] = useState(false);
  const [areas, setAreas] = useState<string[]>(initialAreas);
  const [seniority, setSeniority] = useState(
    initialSeniority in SENIORITY_LABELS ? initialSeniority : "UNKNOWN",
  );
  const [pending, setPending] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const dialogRef = useRef<HTMLDivElement | null>(null);
  const lastFocusedRef = useRef<HTMLElement | null>(null);
  const headingId = useId();
  const descriptionId = useId();

  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    if (open) {
      setShouldRender(true);
      const timeout = setTimeout(() => setVisible(true), 10);
      return () => clearTimeout(timeout);
    }
    setVisible(false);
    const timeout = setTimeout(() => setShouldRender(false), 220);
    return () => clearTimeout(timeout);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeModal();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!isClient || !open || !visible) return;
    lastFocusedRef.current = document.activeElement as HTMLElement | null;
    const root = dialogRef.current;
    if (!root) return;
    const first = root.querySelector<HTMLElement>(
      "button:not([disabled]), input:not([disabled]), select:not([disabled])",
    );
    first?.focus();
  }, [isClient, open, visible]);

  useEffect(() => {
    if (!isClient || !open || !visible) return;
    const handleTab = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const root = dialogRef.current;
      if (!root) return;
      const focusables = Array.from(
        root.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleTab);
    return () => document.removeEventListener("keydown", handleTab);
  }, [isClient, open, visible]);

  useEffect(() => {
    if (open) return;
    const prevFocused = lastFocusedRef.current;
    if (prevFocused?.isConnected) prevFocused.focus();
  }, [open]);

  useEffect(() => {
    if (!isClient || !open) return;
    const prevBody = document.body.style.overflow;
    const prevHtml = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevBody;
      document.documentElement.style.overflow = prevHtml;
    };
  }, [isClient, open]);

  function toggleArea(area: string) {
    setAreas((prev) =>
      prev.includes(area) ? prev.filter((a) => a !== area) : [...prev, area],
    );
  }

  function openModal() {
    setAreas(initialAreas);
    setSeniority(
      initialSeniority in SENIORITY_LABELS ? initialSeniority : "UNKNOWN",
    );
    setOpen(true);
  }

  function closeModal() {
    if (pending) return;
    setOpen(false);
  }

  async function handleSave() {
    setPending(true);
    const ok = await updateMyRadarProfile({ areas, seniority });
    setPending(false);
    if (ok) {
      setOpen(false);
      setToast("Radar recalibrado");
      router.refresh();
    } else {
      setToast("Não foi possível salvar. Tente novamente.");
    }
  }

  return (
    <>
      <button
        type="button"
        data-testid="radar-profile-trigger-btn"
        onClick={openModal}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          background: "transparent",
          color: "#5a5a55",
          border: "1px solid rgba(10,10,10,0.12)",
          borderRadius: 99,
          padding: "6px 12px",
          fontSize: 12,
          fontWeight: 500,
          cursor: "pointer",
          fontFamily: GEIST,
        }}
      >
        <span aria-hidden>⚙</span>
        Ajustar áreas de oportunidade
      </button>

      {isClient && shouldRender
        ? createPortal(
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby={headingId}
              aria-describedby={descriptionId}
              style={{
                position: "fixed",
                inset: 0,
                zIndex: 200,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "16px",
                opacity: visible ? 1 : 0,
                transition: "opacity 200ms ease",
                pointerEvents: visible ? "auto" : "none",
              }}
            >
              <div
                aria-hidden
                onClick={closeModal}
                style={{
                  position: "absolute",
                  inset: 0,
                  background: "rgba(10,10,10,0.45)",
                  backdropFilter: "blur(4px)",
                }}
              />

              <div
                ref={dialogRef}
                data-testid="radar-profile-modal"
                tabIndex={-1}
                style={{
                  position: "relative",
                  zIndex: 1,
                  background: "#fafaf6",
                  border: "1px solid rgba(10,10,10,0.10)",
                  borderRadius: 18,
                  padding: "24px 26px 22px",
                  width: "100%",
                  maxWidth: 480,
                  boxShadow: "0 32px 80px -20px rgba(10,10,10,0.5)",
                  transform: visible
                    ? "translateY(0) scale(1)"
                    : "translateY(6px) scale(0.98)",
                  transition:
                    "transform 240ms cubic-bezier(0.22,1,0.36,1), opacity 200ms ease",
                  maxHeight: "90dvh",
                  overflowY: "auto",
                  fontFamily: GEIST,
                }}
              >
                <p
                  id={headingId}
                  style={{
                    margin: "0 0 4px",
                    fontSize: 20,
                    fontWeight: 500,
                    letterSpacing: -0.6,
                    color: "#0a0a0a",
                  }}
                >
                  Filtros de oportunidade
                </p>
                <p
                  id={descriptionId}
                  style={{
                    margin: "0 0 20px",
                    fontSize: 12.5,
                    color: "#8a8a85",
                  }}
                >
                  Defina suas áreas de interesse para calibrar o Radar
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
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 6,
                    marginBottom: 18,
                  }}
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
                    background: "#fff",
                    border: "1px solid rgba(10,10,10,0.12)",
                    borderRadius: 8,
                    padding: "9px 12px",
                    fontSize: 13,
                    color: "#0a0a0a",
                    fontFamily: GEIST,
                    marginBottom: 22,
                  }}
                >
                  {Object.entries(SENIORITY_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>

                <div
                  style={{
                    display: "flex",
                    justifyContent: "flex-end",
                    gap: 10,
                    paddingTop: 14,
                    borderTop: "1px solid rgba(10,10,10,0.08)",
                  }}
                >
                  <button
                    type="button"
                    data-testid="radar-profile-cancel-btn"
                    onClick={closeModal}
                    disabled={pending}
                    style={{
                      padding: "10px 14px",
                      borderRadius: 10,
                      border: "none",
                      background: "transparent",
                      color: "#5a5a55",
                      fontSize: 13,
                      fontWeight: 500,
                      cursor: pending ? "default" : "pointer",
                      fontFamily: GEIST,
                      opacity: pending ? 0.5 : 1,
                    }}
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    data-testid="radar-profile-save-btn"
                    onClick={() => void handleSave()}
                    disabled={pending}
                    style={{
                      background: "#0a0a0a",
                      color: "#fafaf6",
                      border: "none",
                      borderRadius: 10,
                      padding: "10px 18px",
                      fontSize: 13,
                      fontWeight: 500,
                      cursor: pending ? "default" : "pointer",
                      opacity: pending ? 0.7 : 1,
                      fontFamily: GEIST,
                    }}
                  >
                    {pending ? "Salvando..." : "Salvar"}
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}

      {toast ? <Toast message={toast} onClose={() => setToast(null)} /> : null}
    </>
  );
}
