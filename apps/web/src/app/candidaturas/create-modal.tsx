"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { validateJobDescription } from "@/lib/job-description-validation";
import { createJobApplication } from "@/lib/job-applications-api";

const GEIST = "var(--font-geist), -apple-system, system-ui, sans-serif";
const MONO = "var(--font-geist-mono), monospace";

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 13px",
  borderRadius: 10,
  border: "1px solid rgba(10,10,10,0.10)",
  background: "#fff",
  fontSize: 13.5,
  color: "#0a0a0a",
  fontFamily: GEIST,
  outline: "none",
  boxSizing: "border-box",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontFamily: MONO,
  fontSize: 10,
  fontWeight: 500,
  letterSpacing: "1px",
  color: "#8a8a85",
  marginBottom: 7,
};

type Props = {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  hasMasterResume: boolean;
};

export function CreateApplicationModal({
  open,
  onClose,
  onCreated,
  hasMasterResume,
}: Props) {
  const router = useRouter();
  const [isClient, setIsClient] = useState(false);
  const [shouldRender, setShouldRender] = useState(false);
  const [visible, setVisible] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [jobTitle, setJobTitle] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [location, setLocation] = useState("");
  const [jobUrl, setJobUrl] = useState("");
  const [jobDescriptionText, setJobDescriptionText] = useState("");

  const dialogRef = useRef<HTMLDivElement | null>(null);
  const lastFocusedRef = useRef<HTMLElement | null>(null);
  const headingId = useId();

  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    if (open) {
      setShouldRender(true);
      setTimeout(() => setVisible(true), 10);
    } else {
      setVisible(false);
      const timeout = setTimeout(() => setShouldRender(false), 220);
      setError(null);
      setPending(false);
      setJobTitle("");
      setCompanyName("");
      setLocation("");
      setJobUrl("");
      setJobDescriptionText("");
      return () => clearTimeout(timeout);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    if (!isClient || !open || !visible) return;
    lastFocusedRef.current = document.activeElement as HTMLElement | null;
    const root = dialogRef.current;
    if (!root) return;
    const first = root.querySelector<HTMLElement>(
      "input, textarea, button:not([disabled])",
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
          'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!jobTitle.trim() || !companyName.trim()) return;

    if (jobDescriptionText.trim()) {
      const descError = validateJobDescription(jobDescriptionText);
      if (descError) {
        setError(descError);
        return;
      }
    }

    setPending(true);
    setError(null);
    try {
      await createJobApplication({
        jobTitle: jobTitle.trim(),
        companyName: companyName.trim(),
        ...(location.trim() ? { location: location.trim() } : {}),
        ...(jobUrl.trim() ? { jobUrl: jobUrl.trim() } : {}),
        ...(jobDescriptionText.trim()
          ? { jobDescriptionText: jobDescriptionText.trim() }
          : {}),
      });
      onCreated();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Erro ao criar candidatura",
      );
      setPending(false);
    }
  }

  if (!isClient || !shouldRender) return null;

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
        padding: "16px",
        opacity: visible ? 1 : 0,
        transition: "opacity 200ms ease",
        pointerEvents: visible ? "auto" : "none",
      }}
    >
      {/* Backdrop */}
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

      {/* Panel */}
      <div
        ref={dialogRef}
        style={{
          position: "relative",
          zIndex: 1,
          background: "#fafaf6",
          border: "1px solid rgba(10,10,10,0.10)",
          borderRadius: 18,
          padding: "24px 28px 22px",
          width: "100%",
          maxWidth: 660,
          boxShadow: "0 32px 80px -20px rgba(10,10,10,0.5)",
          transform: visible
            ? "translateY(0) scale(1)"
            : "translateY(6px) scale(0.98)",
          transition:
            "transform 240ms cubic-bezier(0.22,1,0.36,1), opacity 200ms ease",
          maxHeight: "95dvh",
          overflowY: "auto",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 16,
            marginBottom: 22,
          }}
        >
          <div>
            <p
              style={{
                margin: "0 0 6px",
                fontFamily: MONO,
                fontSize: 10,
                letterSpacing: 1.2,
                color: "#8a8a85",
                fontWeight: 500,
              }}
            >
              NOVA CANDIDATURA
            </p>
            <p
              id={headingId}
              style={{
                margin: "0 0 6px",
                fontSize: 24,
                fontWeight: 500,
                letterSpacing: -0.8,
                color: "#0a0a0a",
                fontFamily: GEIST,
                lineHeight: 1.1,
              }}
            >
              Adicionar manualmente
            </p>
            <p
              style={{
                margin: 0,
                fontSize: 13.5,
                color: "#5a5a55",
                fontFamily: GEIST,
                lineHeight: 1.5,
                maxWidth: 480,
              }}
            >
              Use para vagas que você não analisou no EarlyCV. Pode rodar a
              análise depois para gerar score e CV adaptado.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            style={{
              background: "transparent",
              border: "none",
              cursor: "pointer",
              fontSize: 16,
              color: "#8a8a85",
              padding: 4,
              lineHeight: 1,
            }}
          >
            ✕
          </button>
        </div>

        <form
          onSubmit={(e) => void handleSubmit(e)}
          style={{ display: "flex", flexDirection: "column", gap: 12 }}
        >
          {/* Required fields */}
          <div>
            <label htmlFor="cm-job-title" style={labelStyle}>
              Cargo <span style={{ color: "#c0392b" }}>*</span>
            </label>
            <input
              id="cm-job-title"
              type="text"
              placeholder="Ex: Engenheiro de Software Sênior"
              required
              value={jobTitle}
              onChange={(e) => setJobTitle(e.target.value)}
              style={inputStyle}
              autoComplete="off"
            />
          </div>

          <div>
            <label htmlFor="cm-company" style={labelStyle}>
              Empresa <span style={{ color: "#c0392b" }}>*</span>
            </label>
            <input
              id="cm-company"
              type="text"
              placeholder="Ex: Acme Corp"
              required
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              style={inputStyle}
              autoComplete="off"
            />
          </div>

          {/* Optional fields */}
          <div>
            <label htmlFor="cm-location" style={labelStyle}>
              Localidade
            </label>
            <input
              id="cm-location"
              type="text"
              placeholder="Ex: São Paulo, SP · Remoto"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              style={inputStyle}
              autoComplete="off"
            />
          </div>

          <div>
            <label htmlFor="cm-url" style={labelStyle}>
              URL da vaga
            </label>
            <input
              id="cm-url"
              type="url"
              placeholder="https://..."
              value={jobUrl}
              onChange={(e) => setJobUrl(e.target.value)}
              style={inputStyle}
              autoComplete="off"
            />
          </div>

          <div>
            <label htmlFor="cm-description" style={labelStyle}>
              Descrição da vaga
            </label>
            <textarea
              id="cm-description"
              placeholder="Cole a descrição se quiser usar a preparação para entrevista depois."
              value={jobDescriptionText}
              onChange={(e) => setJobDescriptionText(e.target.value.slice(0, 12000))}
              rows={4}
              style={{
                ...inputStyle,
                resize: "none",
                minHeight: 72,
                lineHeight: 1.5,
              }}
            />
          </div>

          {hasMasterResume ? (
            <div
              style={{
                background: "rgba(198,255,58,0.15)",
                border: "1px solid rgba(110,150,20,0.22)",
                borderRadius: 12,
                padding: "12px 14px",
                display: "flex",
                alignItems: "center",
                gap: 10,
              }}
            >
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 7,
                  fontFamily: MONO,
                  fontSize: 10,
                  letterSpacing: 1,
                  color: "#3a5008",
                  fontWeight: 500,
                  flexShrink: 0,
                }}
              >
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: "#7aa811",
                    boxShadow: "0 0 6px rgba(198,255,58,0.8)",
                  }}
                />
                SUGESTAO
              </div>
              <div
                style={{
                  flex: 1,
                  fontSize: 13,
                  color: "#2a3a08",
                  lineHeight: 1.5,
                  fontFamily: GEIST,
                }}
              >
                Quer ja <b>analisar essa vaga</b> com seu CV master? Leva ~24s e
                a candidatura ganha score, gaps e CV adaptado vinculado.
              </div>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  router.push("/adaptar");
                }}
                style={{
                  background: "#0a0a0a",
                  color: "#fff",
                  border: "none",
                  borderRadius: 8,
                  padding: "9px 14px",
                  fontSize: 12.5,
                  fontWeight: 500,
                  cursor: "pointer",
                  fontFamily: GEIST,
                  flexShrink: 0,
                }}
              >
                Analisar agora →
              </button>
            </div>
          ) : null}

          {error && (
            <p
              style={{
                margin: 0,
                fontSize: 12.5,
                color: "#991b1b",
                background: "#fee2e2",
                padding: "8px 12px",
                borderRadius: 8,
              }}
            >
              {error}
            </p>
          )}

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              paddingTop: 16,
              borderTop: "1px solid rgba(10,10,10,0.08)",
              marginTop: 4,
            }}
          >
            <button
              type="button"
              onClick={onClose}
              disabled={pending}
              style={{
                padding: "10px 8px",
                borderRadius: 10,
                border: "none",
                background: "transparent",
                color: "#5a5a55",
                fontSize: 13,
                fontWeight: 500,
                cursor: "pointer",
                fontFamily: GEIST,
                opacity: pending ? 0.5 : 1,
              }}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={pending || !jobTitle.trim() || !companyName.trim()}
              style={{
                padding: "11px 18px",
                borderRadius: 10,
                border: "none",
                background: "#0a0a0a",
                color: "#fafaf6",
                fontSize: 13,
                fontWeight: 500,
                cursor:
                  pending || !jobTitle.trim() || !companyName.trim()
                    ? "not-allowed"
                    : "pointer",
                fontFamily: GEIST,
                opacity:
                  pending || !jobTitle.trim() || !companyName.trim() ? 0.5 : 1,
                boxShadow: "0 4px 12px rgba(0,0,0,0.12)",
              }}
            >
              {pending ? "Salvando…" : "Salvar candidatura"}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
