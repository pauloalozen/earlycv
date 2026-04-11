"use client";

import { useEffect, useRef, useState } from "react";
import { AppHeader } from "@/components/app-header";
import type { ResumeDto } from "@/lib/resumes-api";
import {
  deleteMasterResume,
  getMyMasterResume,
  uploadMasterResume,
} from "@/lib/resumes-api";
import { getAuthStatus } from "@/lib/session-actions";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default function MeusCvsPage() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [userName, setUserName] = useState<string | null | undefined>(
    undefined,
  );
  const [masterResume, setMasterResume] = useState<
    ResumeDto | null | undefined
  >(undefined);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  useEffect(() => {
    getAuthStatus().then(({ userName: name }) => setUserName(name ?? null));
    getMyMasterResume().then((r) => setMasterResume(r ?? null));
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    setPendingFile(file);
    setError(null);
    setSuccess(null);
  };

  const handleUpload = async () => {
    if (!pendingFile) return;

    setUploading(true);
    setError(null);
    setSuccess(null);

    try {
      const formData = new FormData();
      formData.append("file", pendingFile);
      formData.append("title", pendingFile.name.replace(/\.[^.]+$/, ""));
      formData.append("isPrimary", "true");

      const saved = await uploadMasterResume(formData);
      setMasterResume(saved);
      setPendingFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      setSuccess("CV Master salvo com sucesso.");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Erro ao salvar o CV. Tente novamente.",
      );
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async () => {
    if (!masterResume) return;
    if (!confirm("Tem certeza que deseja remover seu CV base?")) return;

    setDeleting(true);
    setError(null);
    setSuccess(null);

    try {
      await deleteMasterResume(masterResume.id);
      setMasterResume(null);
      setSuccess("CV removido.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao remover o CV.");
    } finally {
      setDeleting(false);
    }
  };

  const isLoading = masterResume === undefined || userName === undefined;

  return (
    <main className="min-h-screen bg-[#FAFAFA] text-[#111111]">
      {userName ? (
        <AppHeader userName={userName} />
      ) : (
        <header className="flex shrink-0 items-center px-10 py-6">
          <a
            href="/"
            style={{ color: "#111111" }}
            className="font-logo text-2xl tracking-tight"
          >
            earlyCV
          </a>
        </header>
      )}

      <div className="mx-auto max-w-[680px] space-y-6 px-6 pb-20 pt-8">
        <div className="flex items-center gap-3">
          <a
            href="/dashboard"
            style={{ color: "#666666" }}
            className="text-sm hover:text-[#111111] transition-colors"
          >
            ← Dashboard
          </a>
        </div>

        <div className="px-1">
          <p className="text-[11px] font-bold uppercase tracking-widest text-[#AAAAAA]">
            CV Master
          </p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-[#111111]">
            Seu CV base
          </h1>
          <p className="mt-1 text-sm text-[#666666]">
            Cadastre seu currículo uma vez e reutilize em todas as análises.
          </p>
        </div>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {success && (
          <div className="rounded-xl border border-lime-200 bg-lime-50 px-4 py-3 text-sm text-lime-700">
            {success}
          </div>
        )}

        {isLoading ? (
          <div className="flex min-h-[200px] items-center justify-center">
            <svg
              aria-hidden="true"
              className="animate-spin text-[#AAAAAA]"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
            >
              <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
            </svg>
          </div>
        ) : (
          <>
            {masterResume && !pendingFile && (
              <section className="rounded-xl border border-[#E5E7EB] bg-white p-6 shadow-sm space-y-4">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-widest text-[#AAAAAA]">
                    CV atual
                  </p>
                  <div className="mt-3 rounded-xl border border-[#F2F2F2] bg-[#FAFAFA] p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-[#111111]">
                          {masterResume.title}
                        </p>
                        {masterResume.sourceFileName && (
                          <p className="mt-0.5 truncate text-xs text-[#666666]">
                            {masterResume.sourceFileName}
                          </p>
                        )}
                        <p className="mt-0.5 text-xs text-[#999999]">
                          Atualizado em {formatDate(masterResume.updatedAt)}
                        </p>
                      </div>
                      <span className="shrink-0 rounded-full border border-lime-200 bg-lime-50 px-2.5 py-1 text-xs font-medium text-lime-700">
                        Ativo
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    style={{ color: "#ffffff" }}
                    className="inline-flex h-10 items-center rounded-[10px] bg-[#111111] px-5 text-sm font-medium"
                  >
                    Substituir CV
                  </button>
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={deleting}
                    style={{ color: "#111111" }}
                    className="inline-flex h-10 items-center rounded-[10px] border border-[#E5E5E5] bg-white px-5 text-sm font-medium disabled:opacity-50"
                  >
                    {deleting ? "Removendo..." : "Remover"}
                  </button>
                </div>
              </section>
            )}

            {!masterResume && !pendingFile && (
              <section className="rounded-xl border border-[#E5E7EB] bg-white p-8 text-center shadow-sm space-y-4">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#F5F5F5]">
                  <svg
                    aria-hidden="true"
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#666666"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="12" y1="11" x2="12" y2="17" />
                    <line x1="9" y1="14" x2="15" y2="14" />
                  </svg>
                </div>
                <div>
                  <p className="text-base font-semibold text-[#111111]">
                    Nenhum CV cadastrado ainda
                  </p>
                  <p className="mt-1 text-sm text-[#666666]">
                    Envie seu currículo em PDF para reutilizá-lo em todas as
                    análises.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  style={{ color: "#ffffff" }}
                  className="inline-flex h-11 items-center rounded-[10px] bg-[#111111] px-6 text-sm font-medium"
                >
                  Cadastrar CV
                </button>
              </section>
            )}

            {pendingFile && (
              <section className="rounded-xl border border-[#E5E7EB] bg-white p-6 shadow-sm space-y-4">
                <p className="text-[11px] font-bold uppercase tracking-widest text-[#AAAAAA]">
                  {masterResume ? "Substituir CV" : "Novo CV"}
                </p>

                <div className="rounded-xl border border-[#F2F2F2] bg-[#FAFAFA] p-4">
                  <div className="flex items-center gap-3">
                    <svg
                      aria-hidden="true"
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#111111"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                    </svg>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-[#111111]">
                      {pendingFile.name}
                    </span>
                    <svg
                      aria-hidden="true"
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#84cc16"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </div>
                </div>

                {masterResume && (
                  <p className="rounded-xl border border-yellow-100 bg-yellow-50 px-4 py-3 text-xs text-yellow-800">
                    Ao salvar, seu CV atual será substituído por este arquivo.
                  </p>
                )}

                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={handleUpload}
                    disabled={uploading}
                    style={{ color: "#ffffff" }}
                    className="inline-flex h-10 items-center gap-2 rounded-[10px] bg-[#111111] px-5 text-sm font-medium disabled:opacity-60"
                  >
                    {uploading ? (
                      <>
                        <svg
                          aria-hidden="true"
                          className="animate-spin"
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                        >
                          <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                        </svg>
                        Salvando...
                      </>
                    ) : (
                      "Salvar como CV Master"
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPendingFile(null);
                      if (fileInputRef.current) fileInputRef.current.value = "";
                    }}
                    style={{ color: "#111111" }}
                    className="inline-flex h-10 items-center rounded-[10px] border border-[#E5E5E5] bg-white px-5 text-sm font-medium"
                  >
                    Cancelar
                  </button>
                </div>
              </section>
            )}
          </>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.doc,.docx"
          className="hidden"
          onChange={handleFileSelect}
        />
      </div>
    </main>
  );
}
