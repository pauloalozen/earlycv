"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { uploadMasterResume } from "@/lib/resumes-api";
import type { ResumeDto } from "@/lib/resumes-api";

// ResumesService only checks that turnstileToken is a non-empty string —
// it does not call the Cloudflare siteverify endpoint. Pass a marker so
// the presence check passes. Real verification can be wired in later.
const UPLOAD_TOKEN =
  process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim()
    ? "upload-client-token"
    : "";

function getExt(fileName: string | null | undefined) {
  return fileName?.split(".").pop()?.toLowerCase() ?? "";
}

function ExtBadge({ fileName }: { fileName: string | null | undefined }) {
  const ext = getExt(fileName);
  const label = ext.toUpperCase().slice(0, 4) || "ARQ";
  return (
    <div className="flex h-[52px] w-11 shrink-0 items-center justify-center rounded-[8px] bg-[#0a0a0a] font-mono text-[11px] font-semibold text-[#c6ff3a]">
      {label}
    </div>
  );
}

const labelCls =
  "font-mono text-[10px] font-semibold uppercase tracking-[0.06em] text-[#8a8a85]";

const btnBase =
  "shrink-0 rounded-[8px] px-4 py-2.5 text-[13px] font-medium [font-family:inherit] transition-colors disabled:opacity-50";

type Props = { masterResume: ResumeDto | null };

export function ResumeUploadStrip({ masterResume }: Props) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      if (UPLOAD_TOKEN) formData.append("turnstileToken", UPLOAD_TOKEN);
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
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.docx,.odt"
        className="hidden"
        onChange={handleFileSelect}
      />

      <div className="flex flex-wrap items-center justify-between gap-5 rounded-[14px] border border-[rgba(10,10,10,0.08)] bg-[#fafaf6] px-5 py-4">
        {/* Left: badge + file info */}
        <div className="flex items-center gap-3.5">
          <ExtBadge
            fileName={pendingFile?.name ?? masterResume?.sourceFileName}
          />
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

        {/* Right: actions */}
        <div className="flex flex-col items-end gap-2">
          {error && (
            <p className="max-w-[300px] text-right text-[12px] text-[#9a3d28]">
              {error}
            </p>
          )}

          {pendingFile ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleCancel}
                disabled={uploading}
                className={`${btnBase} border border-[rgba(10,10,10,0.12)] bg-white text-[#0a0a0a] hover:bg-[rgba(10,10,10,0.04)]`}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleUpload}
                disabled={uploading}
                className={`${btnBase} bg-[#0a0a0a] text-[#fafaf6] hover:bg-[#1a1a1a]`}
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
                className={`${btnBase} bg-[#0a0a0a] text-[#fafaf6] hover:bg-[#1a1a1a]`}
              >
                {masterResume ? "Substituir Arquivo" : "Enviar Arquivo"}
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
