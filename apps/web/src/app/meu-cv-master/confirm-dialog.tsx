"use client";

import { useEffect } from "react";

const GEIST = "var(--font-geist), -apple-system, system-ui, sans-serif";

type Props = {
  title: string;
  description: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDialog({
  title,
  description,
  confirmLabel = "Confirmar",
  danger = false,
  onConfirm,
  onCancel,
}: Props) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onCancel]);

  useEffect(() => {
    const prevBody = document.body.style.overflow;
    const prevHtml = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevBody;
      document.documentElement.style.overflow = prevHtml;
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{
        background: "rgba(10,10,10,0.45)",
        backdropFilter: "blur(6px)",
        width: "100vw",
        height: "100vh",
      }}
      onClick={onCancel}
    >
      <div
        className="w-full max-w-[400px] rounded-[16px] border border-[rgba(10,10,10,0.08)] bg-[#fafaf6] p-6 shadow-[0_24px_60px_-12px_rgba(10,10,10,0.35)]"
        style={{ animation: "cv-block-open 0.18s ease-out both" }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-[16px] font-semibold leading-tight tracking-[-0.02em] text-[#0a0a0a]">
          {title}
        </h2>
        <p className="mt-2 text-[13px] leading-relaxed text-[#5a5a55]">
          {description}
        </p>

        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-[8px] border border-[rgba(10,10,10,0.12)] bg-white px-4 py-2 text-[13px] font-medium text-[#0a0a0a] transition-colors hover:bg-[rgba(10,10,10,0.04)]"
            style={{ fontFamily: GEIST }}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-[8px] px-4 py-2 text-[13px] font-medium transition-colors"
            style={
              danger
                ? {
                    fontFamily: GEIST,
                    background: "rgba(154,61,40,0.08)",
                    color: "#9a3d28",
                    border: "1px solid rgba(154,61,40,0.28)",
                  }
                : { fontFamily: GEIST, background: "#0a0a0a", color: "#fafaf6" }
            }
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
