"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { buttonVariants } from "@/components/ui";
import { adminUploadResumeTemplateFile } from "@/lib/admin-resume-templates-api";

type TemplateFileUploadProps = {
  currentFileUrl: string | null;
  templateId: string;
};

export function TemplateFileUpload({
  currentFileUrl,
  templateId,
}: TemplateFileUploadProps) {
  const router = useRouter();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError(null);

    try {
      await adminUploadResumeTemplateFile(templateId, file);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao enviar arquivo");
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  return (
    <div className="space-y-3">
      {currentFileUrl && (
        <div className="flex items-center gap-3">
          <a
            className={buttonVariants({ variant: "outline" })}
            href={currentFileUrl}
            rel="noopener noreferrer"
            target="_blank"
          >
            Visualizar PDF
          </a>
          <span className="text-sm text-stone-500">Arquivo enviado</span>
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <label className="block">
        <input
          accept=".pdf"
          className="hidden"
          disabled={uploading}
          onChange={handleUpload}
          ref={fileInputRef}
          type="file"
        />
        <span
          className={buttonVariants({
            variant: currentFileUrl ? "outline" : "primary",
          })}
        >
          {uploading
            ? "Enviando..."
            : currentFileUrl
              ? "Substituir arquivo"
              : "Selecionar PDF (máx. 10 MB)"}
        </span>
      </label>
    </div>
  );
}
