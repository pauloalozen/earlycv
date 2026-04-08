"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { analyzeGuestCv } from "@/lib/cv-adaptation-api";

export default function AdaptarPage() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [jobDescription, setJobDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      setError("Selecione seu CV em PDF.");
      return;
    }
    if (!jobDescription.trim()) {
      setError("Cole a descrição da vaga.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("jobDescriptionText", jobDescription);

      const result = await analyzeGuestCv(formData);
      sessionStorage.setItem("guestAnalysis", JSON.stringify(result));
      router.push("/adaptar/resultado");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Erro ao analisar CV. Tente novamente.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen flex-col bg-[#FAFAFA] text-[#111111]">
      <header className="flex shrink-0 items-center justify-between px-10 py-6">
        <a
          href="/"
          style={{ color: "#111111" }}
          className="font-logo text-2xl tracking-tight"
        >
          earlyCV
        </a>
      </header>

      <section className="flex flex-1 items-start justify-center px-6 py-12 md:px-10">
        <div className="w-full max-w-2xl space-y-8">
          <div className="space-y-2 text-center">
            <h1 className="text-3xl font-medium leading-tight tracking-tight text-[#111111]">
              Vamos melhorar seu CV para essa vaga
            </h1>
            <p className="text-base text-[#666666]">
              Envie seu CV e cole a vaga. Vamos identificar o que está te
              eliminando e corrigir.
            </p>
          </div>

          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* CV Upload */}
            <div className="space-y-2">
              <span className="text-sm font-medium text-[#111111]">Seu CV</span>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl bg-white px-6 py-10 shadow-sm transition-colors hover:bg-stone-50"
              >
                {file ? (
                  <>
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#111111" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                    </svg>
                    <span className="text-sm font-medium text-[#111111]">
                      {file.name}
                    </span>
                    <span className="text-xs text-[#999999]">
                      Clique para trocar
                    </span>
                  </>
                ) : (
                  <>
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#111111" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="17 8 12 3 7 8" />
                      <line x1="12" y1="3" x2="12" y2="15" />
                    </svg>
                    <span className="text-sm font-medium text-[#111111]">
                      Clique para selecionar
                    </span>
                    <span className="text-xs text-[#999999]">
                      PDF, DOC ou DOCX — até 5 MB
                    </span>
                  </>
                )}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.doc,.docx"
                className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </div>

            {/* Job Description */}
            <div className="space-y-2">
              <label
                htmlFor="job-description"
                className="text-sm font-medium text-[#111111]"
              >
                Descrição da vaga
              </label>
              <textarea
                id="job-description"
                value={jobDescription}
                onChange={(e) => setJobDescription(e.target.value)}
                placeholder="Cole aqui o texto completo da vaga..."
                rows={10}
                maxLength={8000}
                className="w-full resize-none rounded-2xl bg-white px-4 py-3 text-sm text-[#111111] placeholder-[#BBBBBB] outline-none shadow-sm"
              />
              <p className="text-right text-xs text-[#999999]">
                {jobDescription.length}/8000
              </p>
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{ color: "#ffffff" }}
              className="w-full rounded-[14px] bg-[#111111] py-[18px] text-lg font-medium leading-none transition-colors hover:bg-[#222222] disabled:cursor-not-allowed disabled:bg-[#555555]"
            >
              {loading ? "Analisando..." : "Analisar meu CV"}
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}
