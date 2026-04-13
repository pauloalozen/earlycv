"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { DownloadProgressStage } from "@/lib/client-download";

export function DownloadProgressOverlay({
  open,
  stage,
  format,
}: {
  open: boolean;
  stage: DownloadProgressStage | null;
  format: "pdf" | "docx" | null;
}) {
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    if (!isClient || !open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isClient, open]);

  if (!open || !isClient) return null;

  const label = format ? format.toUpperCase() : "arquivo";
  const message =
    stage === "finalizing"
      ? `Concluindo montagem do ${label}...`
      : `Montando ${label}...`;

  return createPortal(
    <div className="fixed inset-0 z-[130] flex h-dvh w-screen items-center justify-center bg-black/35 px-4">
      <div className="w-full max-w-[420px] rounded-2xl bg-white p-6 shadow-2xl">
        <div className="flex items-center gap-3">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-[#D9D9D9] border-t-[#111111]" />
          <p className="text-sm font-semibold text-[#111111]">{message}</p>
        </div>
        <p className="mt-2 text-xs text-[#666666]">
          Aguarde, estamos preparando seu download.
        </p>
      </div>
    </div>,
    document.body,
  );
}
