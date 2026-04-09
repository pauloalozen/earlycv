"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { analyzeGuestCv } from "@/lib/cv-adaptation-api";
import { getAuthStatus } from "@/lib/session-actions";
import { AppHeader } from "@/components/app-header";

const LOADING_STEPS = [
  "Lendo seu CV...",
  "Comparando com a vaga...",
  "Identificando gaps...",
  "Melhorando seu CV...",
];

const EXAMPLE_JOB = `Analista de Dados Sênior — Nubank

Somos um dos maiores bancos digitais do mundo e buscamos um Analista de Dados Sênior para integrar nosso time de Growth Analytics.

Responsabilidades:
• Construir e manter dashboards e relatórios em Looker/Tableau para times de produto e negócio
• Desenvolver modelos preditivos e análises exploratórias usando Python e SQL
• Colaborar com times de engenharia na definição de eventos de tracking e qualidade de dados
• Transformar dados brutos em insights acionáveis que guiem decisões estratégicas
• Mentorear analistas juniores e contribuir para a cultura data-driven da empresa

Requisitos:
• 4+ anos de experiência com análise de dados em ambiente de alta escala
• Domínio avançado de SQL e Python (pandas, scikit-learn)
• Experiência com ferramentas de BI (Looker, Tableau ou Power BI)
• Familiaridade com pipelines de dados (dbt, Airflow ou similares)
• Excelente comunicação para traduzir análises técnicas em linguagem de negócio

Diferenciais:
• Experiência em fintechs ou startups de crescimento acelerado
• Conhecimento de metodologias de experimentação (A/B testing)
• Background em estatística ou ciências de dados

Local: Remoto (Brasil) | Regime: CLT | Área: Dados & Analytics`;

export default function AdaptarPage() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [jobDescription, setJobDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [userName, setUserName] = useState<string | null | undefined>(undefined);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    router.prefetch("/adaptar/resultado");
    getAuthStatus().then(({ userName: name }) => setUserName(name ?? null));
  }, [router]);

  useEffect(() => {
    if (!loading) {
      setLoadingStep(0);
      return;
    }
    const intervals = [0, 3000, 6000, 10000];
    const timers = intervals.map((delay, i) =>
      setTimeout(() => setLoadingStep(i), delay),
    );
    return () => timers.forEach(clearTimeout);
  }, [loading]);

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

      const [result] = await Promise.all([
        analyzeGuestCv(formData),
        new Promise((resolve) => setTimeout(resolve, 10000)),
      ]);

      setLoadingStep(3);
      await new Promise((resolve) => setTimeout(resolve, 2000));
      sessionStorage.setItem("guestAnalysis", JSON.stringify(result));
      router.push("/adaptar/resultado");
    } catch (err) {
      setLoading(false);
      setError(
        err instanceof Error
          ? err.message
          : "Erro ao analisar CV. Tente novamente.",
      );
    }
  };

  return (
    <main className="flex min-h-screen flex-col bg-[#F2F2F2] text-[#111111]">
      {userName ? (
        <AppHeader userName={userName} />
      ) : (
        <header className="flex shrink-0 items-center justify-between px-10 py-6">
          <a href="/" style={{ color: "#111111" }} className="font-logo text-2xl tracking-tight">
            earlyCV
          </a>
          {userName === null && (
            <a
              href="/entrar?tab=entrar"
              style={{ color: "#666666" }}
              className="flex items-center gap-2 rounded-xl border border-[#DDDDDD] px-[18px] py-[6px] text-base font-medium transition-colors hover:border-[#BBBBBB] hover:text-[#111111]"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
              Entrar
            </a>
          )}
        </header>
      )}

      <section className="flex flex-1 items-start justify-center px-6 py-12 md:px-10">
        <div className="w-full max-w-2xl space-y-8">
          <div className="space-y-2 text-center">
            <h1 className="text-3xl font-medium leading-tight tracking-tight text-[#111111]">
              Cole a vaga e envie seu CV. A gente mostra por que você está sendo
              eliminado.
            </h1>
            <p className="text-base text-[#666666]">
              Leva menos de 30 segundos. Você verá os erros e um score do seu
              CV.
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
                className="flex w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl bg-white px-6 py-6 shadow-sm transition-colors hover:bg-stone-50"
              >
                {file ? (
                  <>
                    <svg
                      width="28"
                      height="28"
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
                    <span className="flex items-center gap-1.5 text-sm font-medium text-[#111111]">
                      {file.name}
                      <svg
                        width="26"
                        height="26"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="#84cc16"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </span>
                    <span className="text-xs text-[#999999]">
                      Clique para trocar
                    </span>
                  </>
                ) : (
                  <>
                    <svg
                      width="28"
                      height="28"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#111111"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="17 8 12 3 7 8" />
                      <line x1="12" y1="3" x2="12" y2="15" />
                    </svg>
                    <span className="text-sm font-medium text-[#111111]">
                      Arraste seu CV ou clique para enviar
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
              <div className="flex items-center justify-between">
                <label
                  htmlFor="job-description"
                  className="text-sm font-medium text-[#111111]"
                >
                  Cole aqui a descrição da vaga (LinkedIn, Gupy, etc.)
                </label>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setJobDescription(EXAMPLE_JOB)}
                    className="cursor-pointer text-xs text-[#999999] transition-colors hover:text-[#111111]"
                  >
                    Colar exemplo
                  </button>
                  {jobDescription && (
                    <button
                      type="button"
                      onClick={() => setJobDescription("")}
                      className="text-xs text-[#999999] transition-colors hover:text-[#111111]"
                    >
                      Limpar
                    </button>
                  )}
                </div>
              </div>
              <textarea
                id="job-description"
                value={jobDescription}
                onChange={(e) => setJobDescription(e.target.value)}
                placeholder="Cole aqui o texto completo da vaga..."
                rows={6}
                maxLength={8000}
                className="w-full resize-none rounded-2xl bg-white px-4 py-3 text-sm text-[#111111] placeholder-[#BBBBBB] outline-none shadow-sm"
              />
              <p className="text-right text-xs text-[#999999]">
                {jobDescription.length}/8000
              </p>
            </div>

            <p className="flex items-center gap-1.5 px-1 text-sm font-medium text-lime-700">
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M12 2l2.9 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l7.1-1.01L12 2z" />
              </svg>
              Você verá exatamente o que está te eliminando e como corrigir.
            </p>

            <button
              type="submit"
              disabled={loading}
              style={{ color: "#ffffff" }}
              className="flex w-full items-center justify-center gap-2 rounded-[14px] bg-[#111111] py-[18px] text-lg font-medium leading-none transition-colors hover:bg-[#222222] disabled:cursor-wait disabled:bg-[#333333]"
            >
              {loading ? (
                <>
                  <svg
                    className="animate-spin"
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                  >
                    <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                  </svg>
                  <span className="transition-all duration-500">
                    {LOADING_STEPS[loadingStep]}
                  </span>
                </>
              ) : (
                <>
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                  >
                    <path d="M13 2L4.5 13.5H11L10 22L20.5 9.5H14L13 2Z" />
                  </svg>
                  Analisar agora
                </>
              )}
            </button>
          </form>
        </div>
      </section>

    </main>
  );
}
