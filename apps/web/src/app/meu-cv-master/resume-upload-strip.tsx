"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { EcvBuildLoader } from "@/components/ecv-loader";
import type { ResumeDto } from "@/lib/resumes-api";
import {
  getMyMasterCvExtractionStatus,
  uploadMasterResume,
} from "@/lib/resumes-api";

import { ConfirmDialog } from "./confirm-dialog";

const UPLOAD_TOKEN = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim()
  ? "upload-client-token"
  : "";

const POLL_INTERVAL_MS = 2500;

const MICROFEEDBACK_MESSAGES = [
  "Lendo o documento...",
  "Identificando seções...",
  "Extraindo experiências...",
  "Mapeando competências...",
  "Encontrando dados de contato...",
  "Organizando formação acadêmica...",
  "Finalizando extração...",
];

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

function ProcessingOverlay({ fileName }: { fileName: string }) {
  const [msgIndex, setMsgIndex] = useState(0);
  const [dots, setDots] = useState(0);

  useEffect(() => {
    const bodyOriginal = document.body.style.overflow;
    const htmlOriginal = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = bodyOriginal;
      document.documentElement.style.overflow = htmlOriginal;
    };
  }, []);

  useEffect(() => {
    const msgTimer = setInterval(() => {
      setMsgIndex((i) => (i + 1) % MICROFEEDBACK_MESSAGES.length);
    }, 2200);
    const dotsTimer = setInterval(() => {
      setDots((d) => (d + 1) % 4);
    }, 500);
    return () => {
      clearInterval(msgTimer);
      clearInterval(dotsTimer);
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{
        background: "rgba(10,10,10,0.55)",
        backdropFilter: "blur(8px)",
        width: "100vw",
        height: "100vh",
      }}
    >
      <div
        className="flex w-full max-w-[380px] flex-col items-center gap-5 rounded-[20px] border border-[rgba(255,255,255,0.08)] bg-[#0a0a0a] px-8 py-8 shadow-[0_32px_80px_-16px_rgba(0,0,0,0.8)]"
        style={{ animation: "cv-block-open 0.2s ease-out both" }}
      >
        <EcvBuildLoader size={64} dark />

        <div className="text-center">
          <p className="text-[15px] font-medium tracking-[-0.01em] text-[#fafaf6]">
            Processando CV
          </p>
          <p className="mt-1 font-mono text-[10.5px] text-[#8a8a85]">
            {fileName}
          </p>
        </div>

        <div className="h-[22px] text-center">
          <p className="text-[13px] text-[#a0a09a]">
            {MICROFEEDBACK_MESSAGES[msgIndex]}
            {".".repeat(dots)}
          </p>
        </div>

        <p className="text-center font-mono text-[10px] text-[#5a5a55]">
          Isso pode levar alguns segundos
        </p>
      </div>
    </div>
  );
}

const labelCls =
  "font-mono text-[10px] font-semibold uppercase tracking-[0.06em] text-[#8a8a85]";

const GEIST = "var(--font-geist), -apple-system, system-ui, sans-serif";
const btnBase =
  "shrink-0 rounded-[8px] px-4 py-2.5 text-[13px] font-medium transition-colors disabled:opacity-50";
const BTN_STYLE = { fontFamily: GEIST, fontSize: "13px" } as const;

type Props = { masterResume: ResumeDto | null; hasFilledFields: boolean };

export function ResumeUploadStrip({ masterResume, hasFilledFields }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [processingFileName, setProcessingFileName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const startPolling = useCallback(() => {
    pollRef.current = setInterval(async () => {
      try {
        const status = await getMyMasterCvExtractionStatus();
        if (!status) return;
        if (status.status === "succeeded" || status.status === "failed") {
          stopPolling();
          // router.refresh() depende do router cache do App Router, que pode
          // colidir com a revalidação disparada pela ação de limpar o perfil
          // logo antes do upload — o resultado é a tela ficar com dados
          // velhos até um F5 manual. Um reload completo busca o estado atual
          // direto do servidor, sem essa ambiguidade.
          window.location.reload();
        }
      } catch {
        // keep polling
      }
    }, POLL_INTERVAL_MS);
  }, [stopPolling]);

  useEffect(() => () => stopPolling(), [stopPolling]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    if (!file) return;
    setError(null);

    if (hasFilledFields) {
      // Já tem dado preenchido: pede confirmação antes de sobrescrever.
      setPendingFile(file);
      setShowConfirm(true);
      return;
    }

    // Perfil vazio: processa direto, sem passo intermediário de "confirmar
    // envio" — esse clique extra confundia o usuário (não é óbvio que
    // escolher o arquivo no seletor do SO não é o suficiente).
    setProcessingFileName(file.name);
    setProcessing(true);
    void doUpload(file);
  };

  const doUpload = async (file: File, clearExistingProfile = false) => {
    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("title", file.name.replace(/\.[^.]+$/, ""));
      formData.append("isPrimary", "true");
      if (clearExistingProfile) formData.append("clearExistingProfile", "true");
      if (UPLOAD_TOKEN) formData.append("turnstileToken", UPLOAD_TOKEN);
      await uploadMasterResume(formData);
      setPendingFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      startPolling();
    } catch (err) {
      setProcessing(false);
      setError(
        err instanceof Error ? err.message : "Erro ao enviar o arquivo.",
      );
    } finally {
      setUploading(false);
    }
  };

  const handleConfirmReplace = async () => {
    setShowConfirm(false);
    if (!pendingFile) return;
    setProcessingFileName(pendingFile.name);
    setProcessing(true);
    // Limpar o perfil e subir o novo arquivo é uma única requisição
    // (clearExistingProfile no upload) — evitar dois server actions em
    // sequência, cada um disparando sua própria revalidação de rota, que
    // corria com o polling do status de extração e deixava a tela presa em
    // dados velhos/vazios até um F5 manual.
    await doUpload(pendingFile, true);
  };

  const handleCancelConfirm = () => {
    setShowConfirm(false);
    setPendingFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <>
      {processing && <ProcessingOverlay fileName={processingFileName} />}

      {showConfirm && (
        <ConfirmDialog
          title="Substituir CV Master?"
          description="Isso vai apagar todos os campos preenchidos e recarregar os dados a partir do novo arquivo. Essa ação não pode ser desfeita."
          confirmLabel="Sim, substituir tudo"
          danger
          onConfirm={handleConfirmReplace}
          onCancel={handleCancelConfirm}
        />
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.docx,.odt"
        className="hidden"
        onChange={handleFileSelect}
      />

      <div className="flex flex-wrap items-center justify-between gap-5 rounded-[14px] border border-[rgba(10,10,10,0.08)] bg-[#fafaf6] px-5 py-4">
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

        <div className="flex flex-col items-end gap-2">
          {error && (
            <p className="max-w-[300px] text-right text-[12px] text-[#9a3d28]">
              {error}
            </p>
          )}

          <button
            type="button"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
            className={`${btnBase} bg-[#0a0a0a] text-[#fafaf6] hover:bg-[#1a1a1a]`}
            style={BTN_STYLE}
          >
            {uploading
              ? "Enviando..."
              : masterResume
                ? "Substituir Arquivo"
                : "Enviar Arquivo"}
          </button>
        </div>
      </div>
    </>
  );
}
