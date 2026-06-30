"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { EcvBuildLoader } from "./ecv-loader";

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
const MONO = "var(--font-geist-mono), monospace";

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
      if (event.key === "Escape") onClose();
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
    if (prevFocused?.isConnected) prevFocused.focus();
  }, [open]);

  useEffect(() => {
    if (!isClient || !open) return;
    const prev = document.body.style.overflow;
    const prevHtml = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
      document.documentElement.style.overflow = prevHtml;
    };
  }, [isClient, open]);

  if (!open || !isClient) return null;

  const isLoading = status === "loading";
  const isSuccess = status === "success";
  const isError = status === "error";

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
        background: "rgba(10,10,10,0.5)",
        backdropFilter: "blur(4px)",
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
          onClick={canClose ? onClose : undefined}
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
          maxWidth: 380,
          background: "#0a0a0a",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 20,
          padding: "32px",
          boxShadow: "0 32px 80px -16px rgba(0,0,0,0.8)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 20,
          transition: "all 260ms ease-out",
          opacity: visible ? 1 : 0,
          transform: visible
            ? "translateY(0) scale(1)"
            : "translateY(8px) scale(0.98)",
        }}
      >
        {/* Close button */}
        {canClose && (
          <button
            type="button"
            onClick={onClose}
            style={{
              position: "absolute",
              top: 14,
              right: 14,
              background: "rgba(255,255,255,0.06)",
              border: "none",
              borderRadius: 8,
              width: 30,
              height: 30,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#6a6a64",
              fontSize: 15,
              lineHeight: 1,
            }}
            aria-label="Fechar"
          >
            ×
          </button>
        )}

        {/* Icon / loader */}
        {isLoading && <EcvBuildLoader size={64} dark />}

        {isSuccess && (
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: "50%",
              background: "rgba(198,255,58,0.12)",
              border: "1.5px solid rgba(198,255,58,0.35)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 22,
            }}
          >
            ✓
          </div>
        )}

        {isError && (
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: "50%",
              background: "rgba(239,68,68,0.1)",
              border: "1.5px solid rgba(239,68,68,0.25)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 22,
            }}
          >
            ✕
          </div>
        )}

        {/* Text */}
        <div style={{ textAlign: "center" }}>
          <p
            id={headingId}
            style={{
              fontFamily: GEIST,
              fontSize: 15,
              fontWeight: 500,
              letterSpacing: -0.2,
              color: "#fafaf6",
              margin: "0 0 6px",
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
              fontSize: 13,
              color: "#8a8a85",
              margin: 0,
              lineHeight: 1.5,
            }}
          >
            {isLoading
              ? "Aguarde alguns instantes."
              : isSuccess
                ? "Seu CV está pronto. Baixe e candidate-se o quanto antes."
                : (message ??
                  "Não foi possível liberar seu CV agora. Tente novamente.")}
          </p>
        </div>

        {/* Loading progress label */}
        {isLoading && (
          <p
            style={{
              fontFamily: MONO,
              fontSize: 10.5,
              color: "#5a5a55",
              margin: 0,
              letterSpacing: 0.3,
            }}
          >
            GERANDO CV OTIMIZADO...
          </p>
        )}

        {/* Download buttons */}
        {isSuccess && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 8,
              width: "100%",
            }}
          >
            <button
              type="button"
              onClick={onDownloadPdf}
              disabled={!canDownload || downloading !== null}
              style={{
                background:
                  downloading === "pdf" ? "rgba(198,255,58,0.08)" : "#fafaf6",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 12,
                padding: "13px",
                fontSize: 13.5,
                fontWeight: 500,
                cursor:
                  downloading !== null || !canDownload ? "default" : "pointer",
                color: "#0a0a0a",
                fontFamily: GEIST,
                opacity:
                  downloading !== null && downloading !== "pdf" ? 0.5 : 1,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                width: "100%",
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
              {downloading === "pdf" ? "Baixando PDF..." : "Baixar em PDF"}
            </button>
            <button
              type="button"
              onClick={onDownloadDocx}
              disabled={!canDownload || downloading !== null}
              style={{
                background: "transparent",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 12,
                padding: "13px",
                fontSize: 13.5,
                fontWeight: 500,
                cursor:
                  downloading !== null || !canDownload ? "default" : "pointer",
                color: "#fafaf6",
                fontFamily: GEIST,
                opacity:
                  downloading !== null && downloading !== "docx" ? 0.5 : 1,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                width: "100%",
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
              {downloading === "docx" ? "Baixando DOCX..." : "Baixar em DOCX"}
            </button>
          </div>
        )}

        {/* Error retry hint */}
        {isError && (
          <p
            style={{
              fontFamily: MONO,
              fontSize: 10.5,
              color: "#ef4444",
              margin: 0,
              letterSpacing: 0.3,
            }}
          >
            SE O PROBLEMA PERSISTIR, TENTE NOVAMENTE.
          </p>
        )}

        {/* Screen reader live region */}
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
          @media (max-width: 480px) {
            [data-ecv-release-modal] {
              padding: 24px 20px;
            }
          }
        `}</style>
      </div>
    </div>,
    document.body,
  );
}
