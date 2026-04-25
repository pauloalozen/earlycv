"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { buttonVariants } from "@/components/ui";
import { getTemplateSignedUrlsAction } from "../_actions/get-template-signed-urls";
import { uploadTemplateFileAction } from "../_actions/upload-template-file";

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
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      await uploadTemplateFileAction(templateId, formData);
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

  const handleView = async () => {
    setOpening(true);
    setError(null);
    try {
      const { fileUrl } = await getTemplateSignedUrlsAction(templateId);
      if (!fileUrl) throw new Error("URL não disponível");
      window.open(fileUrl, "_blank", "noopener,noreferrer");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao abrir arquivo");
    } finally {
      setOpening(false);
    }
  };

  return (
    <div className="space-y-3">
      {currentFileUrl && (
        <div className="flex items-center gap-3">
          <button
            className={buttonVariants({ variant: "outline" })}
            disabled={opening}
            onClick={handleView}
            type="button"
          >
            {opening ? "Abrindo..." : "Visualizar DOCX"}
          </button>
          <span className="text-sm text-stone-500">Arquivo enviado</span>
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <label className="block">
        <input
          accept=".docx,.doc"
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
              : "Selecionar DOCX (máx. 10 MB)"}
        </span>
      </label>
    </div>
  );
}
