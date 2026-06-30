"use client";

import { useEffect, useState } from "react";

const GEIST = "var(--font-geist), -apple-system, system-ui, sans-serif";
const CONFIRM_TEXT = "EXCLUIR MINHA CONTA";

export function DeleteAccountSection({
  creditsRemaining,
}: {
  creditsRemaining: number;
}) {
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canConfirm = confirmText.trim() === CONFIRM_TEXT;

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !loading) {
        setOpen(false);
        setConfirmText("");
        setError(null);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, loading]);

  useEffect(() => {
    if (!open) return;
    const prevBody = document.body.style.overflow;
    const prevHtml = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevBody;
      document.documentElement.style.overflow = prevHtml;
    };
  }, [open]);

  const handleClose = () => {
    if (loading) return;
    setOpen(false);
    setConfirmText("");
    setError(null);
  };

  const handleDelete = async () => {
    if (!canConfirm || loading) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/account/delete", {
        method: "POST",
        cache: "no-store",
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          message?: string;
        } | null;
        throw new Error(
          body?.message?.trim() ||
            "Não foi possível excluir sua conta agora. Tente novamente.",
        );
      }
      window.location.assign("/");
    } catch (err) {
      setLoading(false);
      setError(
        err instanceof Error && err.message.trim()
          ? err.message
          : "Não foi possível excluir sua conta agora. Tente novamente.",
      );
    }
  };

  return (
    <>
      <div
        className="flex flex-wrap items-center justify-between gap-5 rounded-[12px] px-5 py-4"
        style={{
          background: "rgba(154,61,40,0.06)",
          border: "1px solid rgba(154,61,40,0.28)",
        }}
      >
        <div>
          <p className="text-[15px] font-semibold tracking-[-0.01em] text-[#9a3d28]">
            Excluir conta
          </p>
          <p className="mt-0.5 max-w-[520px] text-[12.5px] leading-relaxed text-[#5a5a55]">
            Remove seu CV Master, análises e candidaturas. Esta ação é
            permanente, não dá para desfazer.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="shrink-0 rounded-[8px] px-4 py-2.5 text-[13px] font-medium transition-colors hover:bg-[rgba(154,61,40,0.1)]"
          style={{
            fontFamily: GEIST,
            color: "#9a3d28",
            border: "1px solid rgba(154,61,40,0.28)",
          }}
        >
          Excluir conta
        </button>
      </div>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{
            background: "rgba(10,10,10,0.45)",
            backdropFilter: "blur(6px)",
            width: "100vw",
            height: "100vh",
          }}
        >
          <button
            type="button"
            aria-label="Fechar"
            onClick={handleClose}
            className="absolute inset-0 border-0 bg-transparent p-0"
          />
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-[420px] rounded-[16px] border border-[rgba(10,10,10,0.08)] bg-[#fafaf6] p-6 shadow-[0_24px_60px_-12px_rgba(10,10,10,0.35)]"
            style={{
              animation: "cv-block-open 0.18s ease-out both",
              position: "relative",
              zIndex: 1,
            }}
          >
            <h2 className="text-[16px] font-semibold leading-tight tracking-[-0.02em] text-[#0a0a0a]">
              Excluir conta permanentemente
            </h2>
            <p className="mt-2 text-[13px] leading-relaxed text-[#5a5a55]">
              Esta ação remove sua conta, CV Master, análises e candidaturas.
              Não é possível desfazer.
            </p>

            {creditsRemaining > 0 && (
              <p className="mt-2 text-[12.5px] text-[#9a3d28]">
                Você ainda possui <strong>{creditsRemaining} crédito(s)</strong>
                . Ao excluir sua conta, esses créditos serão perdidos.
              </p>
            )}

            <p className="mt-4 text-[13px] text-[#5a5a55]">
              Para confirmar, digite{" "}
              <span className="font-mono font-semibold text-[#0a0a0a]">
                {CONFIRM_TEXT}
              </span>
            </p>
            <input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={CONFIRM_TEXT}
              disabled={loading}
              className="mt-2 w-full rounded-[8px] border border-[rgba(10,10,10,0.14)] px-3 py-2.5 font-mono text-[12.5px] text-[#0a0a0a] outline-none transition-colors focus:border-[rgba(154,61,40,0.5)] disabled:opacity-50"
              style={{ fontFamily: GEIST, boxSizing: "border-box" }}
            />

            {error && (
              <p className="mt-2 font-mono text-[11.5px] text-[#9a3d28]">
                {error}
              </p>
            )}

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={handleClose}
                disabled={loading}
                className="rounded-[8px] border border-[rgba(10,10,10,0.12)] bg-white px-4 py-2 text-[13px] font-medium text-[#0a0a0a] transition-colors hover:bg-[rgba(10,10,10,0.04)] disabled:opacity-50"
                style={{ fontFamily: GEIST }}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={!canConfirm || loading}
                className="rounded-[8px] px-4 py-2 text-[13px] font-medium transition-colors disabled:opacity-50"
                style={{
                  fontFamily: GEIST,
                  background: "rgba(154,61,40,0.08)",
                  color: "#9a3d28",
                  border: "1px solid rgba(154,61,40,0.28)",
                }}
              >
                {loading ? "Excluindo..." : "Excluir minha conta"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
