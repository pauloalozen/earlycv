"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

export type CvReleaseModalStatus = "loading" | "success" | "error";

export type CvReleaseModalProps = {
  open: boolean;
  status: CvReleaseModalStatus;
  message?: string | null;
  canClose: boolean;
  visible: boolean;
  onClose: () => void;
  onDownloadPdf: () => void;
  onDownloadDocx: () => void;
  downloading: "pdf" | "docx" | null;
  canDownload: boolean;
};

const GEIST = "var(--font-geist), -apple-system, system-ui, sans-serif";

export function CvReleaseModal({
  open,
  status,
  message,
  canClose,
  visible,
  onClose,
  onDownloadPdf,
  onDownloadDocx,
  downloading,
  canDownload,
}: CvReleaseModalProps) {
  const [isClient, setIsClient] = useState(false);
  const headingId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const lastFocusedRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    if (!open || !visible || !canClose) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, visible, canClose, onClose]);

  useEffect(() => {
    if (!isClient) return;
    if (!open || !visible) return;
    lastFocusedRef.current = document.activeElement as HTMLElement | null;

    const root = dialogRef.current;
    if (!root) return;

    const focusables = root.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    const first = focusables[0] ?? root;
    first.focus();
  }, [isClient, open, visible]);

  useEffect(() => {
    if (!isClient) return;
    if (!open || !visible) return;

    const handleTabTrap = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;

      const root = dialogRef.current;
      if (!root) return;

      const focusables = Array.from(
        root.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );

      if (focusables.length === 0) {
        event.preventDefault();
        root.focus();
        return;
      }

      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;

      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleTabTrap);
    return () => document.removeEventListener("keydown", handleTabTrap);
  }, [isClient, open, visible]);

  useEffect(() => {
    if (open) return;
    const prevFocused = lastFocusedRef.current;
    if (prevFocused?.isConnected) {
      prevFocused.focus();
    }
  }, [open]);

  useEffect(() => {
    if (!isClient || !open) return;
    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
    };
  }, [isClient, open]);

  if (!open || !isClient) return null;

  const isLoading = status === "loading";
  const isSuccess = status === "success";
  const isError = status === "error";

  const pdfLabel = downloading === "pdf" ? "Baixando PDF..." : "Baixar em PDF";
  const docxLabel =
    downloading === "docx" ? "Baixando DOCX..." : "Baixar em DOCX";
  const closeDisabled = !canClose;

  return createPortal(
    <div
      aria-hidden={!visible}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(10,10,10,0.35)",
        padding: "0 16px",
        transition: "opacity 260ms ease-out",
        opacity: visible ? 1 : 0,
        pointerEvents: visible ? "auto" : "none",
      }}
    >
      {canClose ? (
        <button
          type="button"
          aria-hidden="true"
          tabIndex={-1}
          onClick={closeDisabled ? undefined : onClose}
          style={{ position: "absolute", inset: 0 }}
        />
      ) : null}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        aria-describedby={descriptionId}
        ref={dialogRef}
        tabIndex={-1}
        style={{
          position: "relative",
          width: "100%",
          maxWidth: 520,
          background: "#fff",
          border: "1px solid rgba(10,10,10,0.08)",
          borderRadius: 20,
          padding: "24px",
          boxShadow: "0 24px 60px -20px rgba(10,10,10,0.35)",
          transition: "all 260ms ease-out",
          opacity: visible ? 1 : 0,
          transform: visible
            ? "translateY(0) scale(1)"
            : "translateY(8px) scale(0.98)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 12,
            marginBottom: 20,
          }}
        >
          <div>
            <p
              id={headingId}
              style={{
                fontFamily: GEIST,
                fontSize: 17,
                fontWeight: 500,
                color: "#0a0a0a",
                margin: "0 0 4px",
              }}
            >
              {isLoading
                ? "Liberando seu CV..."
                : isSuccess
                  ? "CV liberado para download"
                  : "Falha ao liberar CV"}
            </p>
            <p
              id={descriptionId}
              style={{
                fontFamily: GEIST,
                fontSize: 13.5,
                color: "#6a6560",
                margin: 0,
              }}
            >
              {isLoading
                ? "Aguarde alguns instantes enquanto finalizamos a liberacao."
                : isSuccess
                  ? "Seu CV já está pronto para ser baixado. Não perca tempo: baixe o CV e candidate-se o mais rápido possível."
                  : message ||
                    "Nao foi possivel liberar seu CV agora. Tente novamente em instantes."}
            </p>
          </div>
          {canClose ? (
            <button
              type="button"
              onClick={onClose}
              style={{
                background: "rgba(10,10,10,0.05)",
                border: "none",
                borderRadius: 8,
                width: 32,
                height: 32,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                color: "#6a6560",
              }}
              aria-label="Fechar aviso"
            >
              x
            </button>
          ) : null}
        </div>

        {isSuccess ? (
          <div className="cv-release-modal-actions">
            <button
              type="button"
              onClick={onDownloadPdf}
              disabled={!canDownload || downloading !== null}
              style={{
                background: "#fafaf6",
                border: "1px solid rgba(10,10,10,0.08)",
                borderRadius: 12,
                padding: "13px",
                fontSize: 13.5,
                fontWeight: 500,
                cursor:
                  downloading !== null || !canDownload ? "default" : "pointer",
                color: "#0a0a0a",
                fontFamily: GEIST,
                opacity: downloading !== null || !canDownload ? 0.6 : 1,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
              }}
            >
              <svg
                aria-hidden="true"
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              {pdfLabel}
            </button>
            <button
              type="button"
              onClick={onDownloadDocx}
              disabled={!canDownload || downloading !== null}
              style={{
                background: "#fafaf6",
                border: "1px solid rgba(10,10,10,0.08)",
                borderRadius: 12,
                padding: "13px",
                fontSize: 13.5,
                fontWeight: 500,
                cursor:
                  downloading !== null || !canDownload ? "default" : "pointer",
                color: "#0a0a0a",
                fontFamily: GEIST,
                opacity: downloading !== null || !canDownload ? 0.6 : 1,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
              }}
            >
              <svg
                aria-hidden="true"
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              {docxLabel}
            </button>
          </div>
        ) : null}

        {isLoading ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              marginTop: 2,
              marginBottom: 4,
            }}
          >
            <div
              aria-hidden
              style={{
                width: 18,
                height: 18,
                borderRadius: "999px",
                border: "2px solid #D9D9D9",
                borderTopColor: "#111111",
                animation: "cv-release-spin 900ms linear infinite",
              }}
            />
            <span
              style={{
                fontFamily: GEIST,
                fontSize: 12.5,
                color: "#5f5f5f",
              }}
            >
              Estamos preparando seu CV otimizado...
            </span>
          </div>
        ) : null}

        {isError ? (
          <p
            style={{
              fontFamily: GEIST,
              margin: 0,
              fontSize: 12.5,
              color: "#991b1b",
            }}
          >
            Se o problema persistir, tente novamente mais tarde.
          </p>
        ) : null}

        <p
          role="status"
          aria-live="polite"
          aria-atomic="true"
          style={{
            position: "absolute",
            width: 1,
            height: 1,
            padding: 0,
            margin: -1,
            overflow: "hidden",
            clip: "rect(0,0,0,0)",
            whiteSpace: "nowrap",
            border: 0,
          }}
        >
          {isLoading
            ? "Liberando seu CV..."
            : isSuccess
              ? "CV liberado para download"
              : "Falha ao liberar CV"}
        </p>

        <style>{`
          @keyframes cv-release-spin {
            to {
              transform: rotate(360deg);
            }
          }

          .cv-release-modal-actions {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 10px;
          }

          @media (max-width: 560px) {
            .cv-release-modal-actions {
              grid-template-columns: 1fr;
            }
          }
        `}</style>
      </div>
    </div>,
    document.body,
  );
}
