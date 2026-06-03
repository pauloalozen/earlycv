"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { uploadMasterResume } from "@/lib/resumes-api";
import type { ResumeDto } from "@/lib/resumes-api";

type ExtBadge = { label: string; bg: string; text: string };

function getExtBadge(fileName: string | null | undefined): ExtBadge {
  const ext = fileName?.split(".").pop()?.toLowerCase() ?? "";
  const label = ext.toUpperCase().slice(0, 4) || "ARQ";
  switch (ext) {
    case "pdf":
      return { label, bg: "#0a0a0a", text: "#c6ff3a" };
    case "docx":
    case "doc":
      return { label, bg: "#1a3a8a", text: "#a8ccff" };
    case "odt":
      return { label, bg: "#3a1a5a", text: "#d4a8ff" };
    default:
      return { label, bg: "#3a3a36", text: "#fafaf6" };
  }
}

const labelCls =
  "font-mono text-[10px] font-semibold uppercase tracking-[0.06em] text-[#8a8a85]";

type Props = { masterResume: ResumeDto | null };

export function ResumeUploadStrip({ masterResume }: Props) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const badge = getExtBadge(
    pendingFile?.name ?? masterResume?.sourceFileName,
  );

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    setPendingFile(file);
    setError(null);
  };

  const handleUpload = async () => {
    if (!pendingFile) return;
    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", pendingFile);
      formData.append("title", pendingFile.name.replace(/\.[^.]+$/, ""));
      formData.append("isPrimary", "true");
      await uploadMasterResume(formData);
      setPendingFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Erro ao enviar o arquivo.",
      );
    } finally {
      setUploading(false);
    }
  };

  const handleCancel = () => {
    setPendingFile(null);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-5 rounded-[14px] border border-[rgba(10,10,10,0.08)] bg-[#fafaf6] px-5 py-4">
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.doc,.docx,.odt"
        className="hidden"
        onChange={handleFileSelect}
      />

      {/* Left: badge + info */}
      <div className="flex items-center gap-3.5">
        <div
          className="flex h-[52px] w-11 shrink-0 items-center justify-center rounded-[8px] font-mono text-[11px] font-semibold"
          style={{ background: badge.bg, color: badge.text }}
        >
          {badge.label}
        </div>
        <div>
          <p className={labelCls}>CV Base</p>
          <p className="mt-0.5 text-[14.5px] font-medium tracking-[-0.01em] text-[#0a0a0a]">
            {pendingFile
              ? pendingFile.name
              : (masterResume?.title ?? "Nenhum CV Master ativo")}
          </p>
          <p className="mt-0.5 font-mono text-[10.5px] text-[#8a8a85]">
            {pendingFile
              ? `${(pendingFile.size / 1024).toFixed(0)} KB`
              : masterResume
                ? (masterResume.sourceFileName ?? "extraído pela IA")
                : "Envie um arquivo para iniciar."}
          </p>
        </div>
      </div>

      {/* Right: hint + action */}
      <div className="flex flex-col items-end gap-2">
        {error && <p className="text-[12px] text-[#9a3d28]">{error}</p>}

        {pendingFile ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCancel}
              disabled={uploading}
              className="rounded-[8px] border border-[rgba(10,10,10,0.12)] bg-white px-4 py-2 text-[13px] font-medium text-[#0a0a0a] transition-colors hover:bg-[rgba(10,10,10,0.04)] disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleUpload}
              disabled={uploading}
              className="rounded-[8px] bg-[#0a0a0a] px-4 py-2.5 text-[13px] font-medium transition-colors hover:bg-[#1a1a1a] disabled:opacity-50"
              style={{ color: "#fafaf6" }}
            >
              {uploading ? "Enviando..." : "Confirmar envio"}
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            {masterResume && (
              <p className="max-w-[220px] text-right text-[11.5px] leading-[1.4] text-[#8a8a85]">
                Substituir re-extrai os dados. Suas edições são preservadas
                quando possível.
              </p>
            )}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="shrink-0 rounded-[8px] bg-[#0a0a0a] px-4 py-2.5 text-[13px] font-medium transition-colors hover:bg-[#1a1a1a]"
              style={{ color: "#fafaf6" }}
            >
              {masterResume ? "Substituir Arquivo" : "Enviar Arquivo"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
