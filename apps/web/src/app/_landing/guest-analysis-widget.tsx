"use client";

import { useRouter } from "next/navigation";
import Script from "next/script";
import { useEffect, useState } from "react";
import { EcvScanLoader } from "@/components/ecv-loader";
import { runAuthenticatedAnalysisFlow } from "@/lib/authenticated-analysis-flow";
import {
  appendTurnstileTokenToAnalyzeFormData,
  validateCvTextInput,
} from "@/lib/cv-adaptation-flow-helpers";
import { runGuestAnalysisFlow } from "@/lib/guest-analysis-flow";
import { getJourneySessionInternalId } from "@/lib/journey-session";
import { useTurnstileToken } from "@/lib/use-turnstile-token";
import { getOrCreateVisitorId } from "@/lib/visitor-id";

const GEIST = "var(--font-geist), -apple-system, system-ui, sans-serif";
const MONO = "var(--font-geist-mono), monospace";

const ANALYSIS_LOADING_STEPS = [
  "Lendo seu CV...",
  "Comparando com a vaga...",
  "Identificando pontos de melhoria...",
  "Quase lá...",
];
const ANALYSIS_LOADING_STEP_INTERVAL_MS = 3500;

type CvMode = "upload" | "text";
type Step = 1 | 2;

const JOB_EXAMPLES: { title: string; description: string }[] = [
  {
    title: "Analista de Dados Sênior",
    description: `Analista de Dados Sênior — ACME S/A

Somos um dos maiores bancos digitais do mundo e buscamos um Analista de Dados Sênior para integrar nosso time de Growth Analytics.

Responsabilidades:
• Construir e manter dashboards e relatórios em Looker/Tableau para times de produto e negócio
• Desenvolver modelos preditivos e análises exploratórias usando Python e SQL
• Colaborar com times de engenharia na definição de eventos de tracking e qualidade de dados

Requisitos:
• 4+ anos de experiência com análise de dados em ambiente de alta escala
• Domínio avançado de SQL e Python (pandas, scikit-learn)
• Experiência com ferramentas de BI (Looker, Tableau ou Power BI)

Local: Remoto (Brasil) | Regime: CLT | Área: Dados & Analytics`,
  },
  {
    title: "Desenvolvedor(a) Full Stack",
    description: `Desenvolvedor(a) Full Stack Pleno — EARLYCV

Buscamos um(a) desenvolvedor(a) full stack para atuar em produtos de pagamento de alta escala.

Responsabilidades:
• Desenvolver features end-to-end em React/Next.js no front e Node.js/NestJS no back
• Participar de code review e decisões de arquitetura
• Garantir qualidade via testes automatizados

Requisitos:
• 3+ anos com TypeScript, React e Node.js
• Experiência com bancos de dados relacionais (PostgreSQL)
• Familiaridade com CI/CD e containers (Docker)

Local: Híbrido (São Paulo) | Regime: CLT | Área: Engenharia`,
  },
  {
    title: "Analista de Business Intelligence",
    description: `Analista de Business Intelligence — ACME S/A

Procuramos um(a) Analista de BI para apoiar decisões estratégicas do time comercial.

Responsabilidades:
• Construir pipelines de dados e dashboards executivos
• Traduzir necessidades de negócio em modelos de dados
• Automatizar relatórios recorrentes

Requisitos:
• 2+ anos de experiência com SQL avançado e Power BI
• Conhecimento de modelagem dimensional
• Boa comunicação com áreas não técnicas

Local: São Paulo | Regime: CLT | Área: Dados`,
  },
  {
    title: "Analista de Marketing",
    description: `Analista de Marketing Digital — EARLYCV

Buscamos um(a) Analista de Marketing para performance em canais digitais.

Responsabilidades:
• Planejar e executar campanhas de mídia paga (Google Ads, Meta Ads)
• Analisar métricas de funil e propor otimizações
• Colaborar com times de conteúdo e design

Requisitos:
• 2+ anos de experiência com marketing de performance
• Domínio de Google Analytics e ferramentas de automação
• Perfil analítico e orientado a dados

Local: Remoto (Brasil) | Regime: CLT | Área: Marketing`,
  },
  {
    title: "Product Manager",
    description: `Product Manager Pleno — ACME S/A

Buscamos um(a) PM para liderar a evolução de um produto de engajamento de clientes.

Responsabilidades:
• Definir e priorizar o roadmap do produto junto a stakeholders
• Escrever specs claras e acompanhar a execução com o time de engenharia
• Analisar métricas de produto e conduzir experimentos

Requisitos:
• 3+ anos de experiência em gestão de produto digital
• Vivência com metodologias ágeis e discovery
• Inglês avançado

Local: Remoto (Brasil) | Regime: CLT | Área: Produto`,
  },
  {
    title: "Engenheiro(a) de Dados",
    description: `Engenheiro(a) de Dados Pleno — EARLYCV

Buscamos um(a) Engenheiro(a) de Dados para escalar nossa infraestrutura de dados de pagamentos.

Responsabilidades:
• Construir e manter pipelines de ingestão e transformação (ETL/ELT)
• Modelar dados em data warehouse (BigQuery/Redshift)
• Garantir qualidade, governança e observabilidade dos dados

Requisitos:
• 3+ anos de experiência com Python e SQL em escala
• Experiência com Airflow, dbt ou ferramentas similares
• Conhecimento de arquitetura de dados em nuvem (AWS/GCP)

Local: Remoto (Brasil) | Regime: CLT | Área: Dados & Engenharia`,
  },
  {
    title: "Analista de Customer Success",
    description: `Analista de Customer Success — ACME S/A

Buscamos um(a) CS para garantir a satisfação e retenção de contas estratégicas.

Responsabilidades:
• Acompanhar a jornada do cliente pós-venda e antecipar riscos de churn
• Conduzir onboarding e treinamentos de produto
• Identificar oportunidades de expansão de conta (upsell)

Requisitos:
• 2+ anos de experiência em customer success ou account management
• Boa comunicação escrita e verbal, perfil consultivo
• Inglês intermediário/avançado

Local: Remoto (Brasil) | Regime: CLT | Área: Customer Success`,
  },
  {
    title: "Analista de Vendas (SDR)",
    description: `SDR - Sales Development Representative — EARLYCV

Buscamos um(a) SDR para gerar e qualificar oportunidades para o time comercial.

Responsabilidades:
• Prospectar novos clientes via outbound (e-mail, telefone, LinkedIn)
• Qualificar leads segundo critérios do funil comercial
• Agendar reuniões para os Account Executives

Requisitos:
• 1+ ano de experiência em prospecção ou vendas B2B
• Boa comunicação e resiliência a rejeição
• Familiaridade com CRM (Salesforce, HubSpot ou similar)

Local: Híbrido (São Paulo) | Regime: CLT | Área: Comercial`,
  },
  {
    title: "UX/Product Designer",
    description: `UX/Product Designer Pleno — ACME S/A

Buscamos um(a) designer para elevar a experiência de uso de nossa plataforma educacional.

Responsabilidades:
• Conduzir pesquisas com usuários e traduzir insights em soluções de design
• Criar wireframes, protótipos e fluxos completos no Figma
• Colaborar com PMs e engenheiros na entrega das features

Requisitos:
• 3+ anos de experiência em UX/Product Design
• Portfólio com processos de pesquisa e decisões de design documentadas
• Conhecimento de design systems

Local: Remoto (Brasil) | Regime: CLT | Área: Design`,
  },
  {
    title: "Analista Financeiro",
    description: `Analista Financeiro Pleno — EARLYCV

Buscamos um(a) Analista Financeiro para apoiar o planejamento orçamentário da área.

Responsabilidades:
• Elaborar relatórios gerenciais e análises de variação orçamentária
• Apoiar o processo de fechamento mensal e forecast
• Propor melhorias em processos financeiros

Requisitos:
• 2+ anos de experiência em análise financeira ou controladoria
• Excel avançado (tabelas dinâmicas, Power Query)
• Formação em Administração, Economia ou Contabilidade

Local: São Paulo | Regime: CLT | Área: Financeiro`,
  },
  {
    title: "Analista de RH / People",
    description: `Analista de People — ACME S/A

Buscamos um(a) Analista de People para apoiar processos de atração e desenvolvimento de talentos.

Responsabilidades:
• Conduzir processos seletivos de ponta a ponta
• Apoiar iniciativas de clima organizacional e engajamento
• Acompanhar indicadores de people analytics

Requisitos:
• 2+ anos de experiência em RH generalista ou recrutamento
• Boa comunicação e perfil orientado a pessoas
• Conhecimento de ferramentas de ATS (Gupy, Greenhouse ou similar)

Local: Híbrido (São Paulo) | Regime: CLT | Área: Gente & Gestão`,
  },
  {
    title: "Engenheiro(a) DevOps/SRE",
    description: `Engenheiro(a) DevOps/SRE Sênior — EARLYCV

Buscamos um(a) Engenheiro(a) DevOps para garantir a confiabilidade e escalabilidade da infraestrutura.

Responsabilidades:
• Manter e evoluir pipelines de CI/CD
• Gerenciar infraestrutura como código (Terraform) em nuvem
• Definir e monitorar SLOs/SLIs, atuar em incidentes

Requisitos:
• 4+ anos de experiência com Kubernetes, Docker e AWS/GCP/Azure
• Experiência com observabilidade (Datadog, Grafana ou similar)
• Conhecimento de scripting (Python, Bash ou Go)

Local: Remoto (Brasil) | Regime: CLT | Área: Infraestrutura`,
  },
  {
    title: "Assistente Administrativo",
    description: `Assistente Administrativo — ACME S/A

Buscamos um(a) Assistente Administrativo para dar suporte às operações da loja/escritório.

Responsabilidades:
• Organizar documentos, agendas e correspondências
• Apoiar processos de compras e controle de estoque de materiais
• Dar suporte a outras áreas em demandas administrativas do dia a dia

Requisitos:
• Ensino médio completo (cursando superior é um diferencial)
• Boa organização e atenção a detalhes
• Conhecimento básico de pacote Office

Local: São Paulo | Regime: CLT | Área: Administrativo`,
  },
];

export function GuestAnalysisWidget({
  guestAnalysisAuthGateEnabled,
  isAuthenticated,
}: {
  guestAnalysisAuthGateEnabled: boolean;
  isAuthenticated: boolean;
}) {
  const router = useRouter();
  const {
    turnstileSiteKey,
    containerRef: turnstileContainerRef,
    requestToken: requestTurnstileToken,
    onScriptReady: markTurnstileScriptReady,
  } = useTurnstileToken();

  const [step, setStep] = useState<Step>(1);
  const [cvMode, setCvMode] = useState<CvMode>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [cvText, setCvText] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [fileHover, setFileHover] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [scanningFile, setScanningFile] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);

  const hasValidCv =
    cvMode === "upload" ? !!file : !validateCvTextInput(cvText);

  // Micro-feedback durante a análise real (pode levar bem mais que o
  // progresso fake do upload) — troca a mensagem do botão periodicamente
  // em vez de deixar "Analisando..." parado.
  useEffect(() => {
    if (!loading) {
      setLoadingStep(0);
      return;
    }
    const interval = setInterval(() => {
      setLoadingStep((step) => (step + 1) % ANALYSIS_LOADING_STEPS.length);
    }, ANALYSIS_LOADING_STEP_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [loading]);

  function goToStep2() {
    setError(null);
    setStep(2);
  }

  function selectFile(nextFile: File) {
    if (nextFile.size > 5 * 1024 * 1024) {
      setError("O arquivo é muito grande. Envie um PDF de até 5 MB.");
      return;
    }
    setFile(nextFile);
    setError(null);
    setScanProgress(0);
    setScanningFile(true);
  }

  // Progresso fake de leitura do arquivo — puramente visual (a análise real
  // só roda depois, no submit do passo 2), só pra dar sensação de que o
  // upload foi processado antes de revelar o passo 2.
  useEffect(() => {
    if (!scanningFile) {
      return;
    }

    const raf = requestAnimationFrame(() => setScanProgress(100));
    const timer = setTimeout(() => {
      setScanningFile(false);
      setStep(2);
    }, 2000);

    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timer);
    };
  }, [scanningFile]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!hasValidCv) {
      setError("Volte e revise o CV enviado.");
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
      formData.append("jobDescriptionText", jobDescription);
      if (cvMode === "text") {
        formData.append("masterCvText", cvText.trim());
      } else if (file) {
        formData.append("file", file);
      }

      const turnstileToken = await requestTurnstileToken();
      appendTurnstileTokenToAnalyzeFormData(formData, turnstileToken);

      const journeyContext = {
        sessionInternalId: getJourneySessionInternalId(),
        visitorId: getOrCreateVisitorId(),
      };

      // Usuário já logado na landing não passa pelo fluxo guest (gate,
      // sessionStorage, /entrar) — vai direto pro pipeline autenticado,
      // igual a /adaptar, e cai direto no resultado.
      const result = isAuthenticated
        ? await runAuthenticatedAnalysisFlow({
            formData,
            inputMode: cvMode === "text" ? "text_paste" : "file_upload",
            journeyContext,
          })
        : await runGuestAnalysisFlow({
            formData,
            journeyContext,
            guestAnalysisAuthGateEnabled,
          });

      if (result.kind === "error") {
        setLoading(false);
        setError(result.error);
        return;
      }

      router.push(result.destination);
    } catch (err) {
      setLoading(false);
      setError(
        err instanceof Error
          ? err.message
          : "Erro ao analisar CV. Tente novamente.",
      );
    }
  }

  return (
    <>
      {turnstileSiteKey ? (
        <Script
          src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
          strategy="afterInteractive"
          onReady={markTurnstileScriptReady}
        />
      ) : null}

      {/* Enquanto a análise está processando, bloqueia qualquer clique na
          landing inteira (nav, CTAs de outras seções etc.) — nunca deixa o
          usuário sair da tela no meio do processamento. Cobre a página
          inteira via position:fixed, independente de onde o widget está no
          layout; zIndex maior que o da nav (20). */}
      {(loading || scanningFile) && (
        <div
          aria-hidden
          data-testid="lp-f-processing-overlay"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            cursor: "wait",
            background: "rgba(10,10,10,0.03)",
          }}
        />
      )}

      <div
        ref={turnstileContainerRef}
        aria-hidden
        style={{
          position: "fixed",
          left: -10000,
          top: -10000,
          width: 320,
          height: 80,
          pointerEvents: "none",
          opacity: 0,
        }}
      />

      <div>
        <div
          className="reveal-card"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 22,
          }}
        >
          {[
            { n: 1, label: "Enviar CV", done: step >= 1 },
            { n: 2, label: "Colar vaga", done: step >= 2 },
            { n: 3, label: "Ver resultado", done: false },
          ].map((s, i) => (
            <div key={s.n} style={{ display: "flex", alignItems: "center" }}>
              {i > 0 && (
                <div
                  style={{
                    width: 64,
                    height: 1,
                    background: "rgba(10,10,10,0.14)",
                    margin: "0 6px 22px",
                  }}
                />
              )}
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <div
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: "50%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontFamily: MONO,
                    fontSize: 12.5,
                    fontWeight: 500,
                    background: s.done ? "#0a0a0a" : "transparent",
                    color: s.done ? "#c6ff3a" : "#8a8a85",
                    border: s.done ? "none" : "1px solid rgba(10,10,10,0.16)",
                  }}
                >
                  {s.n}
                </div>
                <div
                  className="lp-f-step-name"
                  style={{
                    fontSize: 12,
                    color: "#6a6a66",
                    fontWeight: 500,
                    whiteSpace: "nowrap",
                  }}
                >
                  {s.label}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Slot de tamanho fixo — sempre ocupa o mesmo espaço, com ou sem
            erro, pra nunca empurrar o resto do widget quando aparece. */}
        <div
          role={error ? "alert" : undefined}
          aria-live="polite"
          style={{
            height: error ? "auto" : 0,
            minHeight: error ? 20 : 0,
            marginBottom: error ? 14 : 0,
            padding: error ? "10px 14px" : "0 14px",
            boxSizing: "border-box",
            background: error ? "#fee2e2" : "transparent",
            border: error ? "1px solid #fecaca" : "1px solid transparent",
            borderRadius: 10,
            fontSize: 13,
            color: "#991b1b",
            fontFamily: MONO,
            textAlign: "left",
            overflow: "hidden",
            transition: "all 120ms",
          }}
        >
          {error}
        </div>

        <div>
          {step === 1 ? (
            <>
              {/* Área do CV — altura fixa, igual para upload e texto, pra
                  alternar entre os dois modos não empurrar nada abaixo. */}
              <div style={{ height: 190 }}>
                {scanningFile ? (
                  <div
                    style={{
                      height: "100%",
                      boxSizing: "border-box",
                      background: "#fff",
                      border: "1.5px dashed rgba(10,10,10,0.18)",
                      borderRadius: 16,
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 12,
                      textAlign: "center",
                    }}
                  >
                    <EcvScanLoader size={32} />
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 500,
                        color: "#0a0a0a",
                      }}
                    >
                      Lendo {file?.name ?? "seu currículo"}...
                    </div>
                    <div
                      style={{
                        width: 160,
                        height: 4,
                        borderRadius: 2,
                        background: "rgba(10,10,10,0.08)",
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          width: `${scanProgress}%`,
                          height: "100%",
                          background: "#0a0a0a",
                          transition: "width 1900ms linear",
                        }}
                      />
                    </div>
                  </div>
                ) : cvMode === "text" ? (
                  <div
                    style={{
                      height: "100%",
                      boxSizing: "border-box",
                      background: "#fff",
                      border: "1.5px dashed rgba(10,10,10,0.18)",
                      borderRadius: 16,
                      padding: "20px",
                      textAlign: "left",
                    }}
                  >
                    <textarea
                      value={cvText}
                      onChange={(e) =>
                        setCvText(e.target.value.slice(0, 20000))
                      }
                      placeholder="Cole seu currículo em texto (resumo, experiências, formação, competências)..."
                      style={{
                        width: "100%",
                        height: "100%",
                        border: "none",
                        outline: "none",
                        fontFamily: GEIST,
                        fontSize: 13.5,
                        lineHeight: 1.5,
                        resize: "none",
                        background: "transparent",
                      }}
                    />
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() =>
                      document.getElementById("lp-f-file-input")?.click()
                    }
                    onMouseEnter={() => setFileHover(true)}
                    onMouseLeave={() => setFileHover(false)}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "copy";
                      setFileHover(true);
                    }}
                    onDragLeave={() => setFileHover(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setFileHover(false);
                      const droppedFile = e.dataTransfer.files?.[0] ?? null;
                      if (!droppedFile) return;
                      const ext =
                        droppedFile.name.split(".").pop()?.toLowerCase() ?? "";
                      if (!["pdf", "docx", "odt"].includes(ext)) {
                        setError(
                          "Formato inválido. Envie um arquivo PDF, DOCX ou ODT.",
                        );
                        return;
                      }
                      selectFile(droppedFile);
                    }}
                    style={{
                      width: "100%",
                      height: "100%",
                      boxSizing: "border-box",
                      background: "#fff",
                      border: `1.5px dashed ${fileHover || file ? "#0a0a0a" : "rgba(10,10,10,0.18)"}`,
                      borderRadius: 16,
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 14,
                      textAlign: "center",
                      cursor: "pointer",
                    }}
                  >
                    <svg
                      width="34"
                      height="34"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#8a8a85"
                      strokeWidth="1.4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <title>Enviar CV</title>
                      <path d="M12 3v12M12 3l-4 4M12 3l4 4" />
                      <path d="M4 15v3a2 2 0 002 2h12a2 2 0 002-2v-3" />
                    </svg>
                    <div
                      style={{
                        fontSize: 15,
                        fontWeight: 500,
                        color: "#0a0a0a",
                      }}
                    >
                      {file ? file.name : "Envie seu currículo para começar"}
                    </div>
                    <div style={{ fontSize: 12.5, color: "#8a8a85" }}>
                      PDF, DOCX ou ODT · até 5 MB · grátis
                    </div>
                  </button>
                )}
              </div>
              <input
                id="lp-f-file-input"
                type="file"
                accept=".pdf,.docx,.odt"
                className="hidden"
                onChange={(e) => {
                  const nextFile = e.target.files?.[0] ?? null;
                  if (nextFile) {
                    selectFile(nextFile);
                  }
                }}
              />

              <button
                type="button"
                onClick={() => {
                  setCvMode((mode) => (mode === "upload" ? "text" : "upload"));
                  setError(null);
                }}
                disabled={scanningFile}
                style={{
                  display: "block",
                  margin: "18px auto 22px",
                  background: "transparent",
                  border: "none",
                  cursor: scanningFile ? "default" : "pointer",
                  fontFamily: GEIST,
                  fontSize: 13.5,
                  fontWeight: 500,
                  color: "#0a0a0a",
                  textDecoration: "underline",
                  textDecorationColor: "rgba(10,10,10,0.2)",
                  textUnderlineOffset: 4,
                  visibility: scanningFile ? "hidden" : "visible",
                }}
              >
                {cvMode === "upload"
                  ? "Ou cole o texto do currículo"
                  : "Ou envie um arquivo"}
              </button>

              {/* Slot de tamanho fixo — só o modo texto usa o botão, mas o
                  espaço fica reservado nos dois modos pra não pular. */}
              <div style={{ height: 46 }}>
                <button
                  type="button"
                  onClick={goToStep2}
                  disabled={!hasValidCv || cvMode !== "text"}
                  style={{
                    width: "100%",
                    maxWidth: 320,
                    margin: "0 auto",
                    display: "block",
                    background: "#0a0a0a",
                    color: "#fafaf6",
                    border: "none",
                    borderRadius: 12,
                    padding: "13px",
                    fontSize: 14,
                    fontWeight: 500,
                    cursor: hasValidCv ? "pointer" : "not-allowed",
                    opacity: hasValidCv ? 1 : 0.5,
                    fontFamily: GEIST,
                    visibility: cvMode === "text" ? "visible" : "hidden",
                  }}
                >
                  Continuar →
                </button>
              </div>
            </>
          ) : (
            <form onSubmit={handleSubmit} style={{ textAlign: "left" }}>
              <div
                className="lp-f-job-grid"
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 300px",
                  border: "1px solid #d8d6ce",
                  borderRadius: 12,
                  overflow: "hidden",
                  marginBottom: 14,
                  background: "#fafaf6",
                  height: 260,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    height: "100%",
                    minHeight: 0,
                    borderRight: "1px solid #d8d6ce",
                    minWidth: 0,
                  }}
                >
                  <div
                    style={{
                      flexShrink: 0,
                      padding: "12px 14px 8px",
                      fontFamily: MONO,
                      fontSize: 10.5,
                      letterSpacing: 0.5,
                      color: "#8a8a85",
                    }}
                  >
                    COLE A VAGA
                  </div>
                  <div
                    style={{
                      flex: 1,
                      minHeight: 0,
                      padding: "0 14px 14px",
                    }}
                  >
                    <textarea
                      value={jobDescription}
                      onChange={(e) =>
                        setJobDescription(e.target.value.slice(0, 12000))
                      }
                      placeholder="Cole a vaga completa"
                      style={{
                        width: "100%",
                        height: "100%",
                        border: "none",
                        outline: "none",
                        fontFamily: GEIST,
                        fontSize: 13.5,
                        lineHeight: 1.55,
                        resize: "none",
                        background: "transparent",
                      }}
                    />
                  </div>
                </div>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    height: "100%",
                    minHeight: 0,
                    minWidth: 0,
                  }}
                >
                  <div
                    style={{
                      flexShrink: 0,
                      padding: "12px 14px 8px",
                      fontFamily: MONO,
                      fontSize: 10.5,
                      letterSpacing: 0.5,
                      color: "#8a8a85",
                    }}
                  >
                    OU USE UM EXEMPLO
                  </div>
                  <div
                    style={{
                      flex: 1,
                      minHeight: 0,
                      overflowY: "auto",
                      padding: "0 14px 14px",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 2,
                      }}
                    >
                      {JOB_EXAMPLES.map((example) => (
                        <button
                          key={example.title}
                          type="button"
                          onClick={() => setJobDescription(example.description)}
                          style={{
                            textAlign: "left",
                            background:
                              jobDescription === example.description
                                ? "rgba(10,10,10,0.06)"
                                : "transparent",
                            border: "none",
                            borderRadius: 6,
                            padding: "7px 8px",
                            cursor: "pointer",
                            fontFamily: GEIST,
                            fontSize: 13,
                            color: "#0a0a0a",
                          }}
                        >
                          {example.title}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 9,
                  background: "#0a0a0a",
                  color: "#fafaf6",
                  border: "none",
                  borderRadius: 12,
                  padding: "15px",
                  fontSize: 15,
                  fontWeight: 500,
                  cursor: loading ? "wait" : "pointer",
                  fontFamily: GEIST,
                  opacity: loading ? 0.75 : 1,
                }}
              >
                {loading ? (
                  <>
                    {/* biome-ignore lint/a11y/noSvgWithoutTitle: decorative */}
                    <svg
                      aria-hidden
                      className="animate-spin"
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                    >
                      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                    </svg>
                    <span>{ANALYSIS_LOADING_STEPS[loadingStep]}</span>
                  </>
                ) : (
                  <>
                    <svg
                      width="15"
                      height="15"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <title>Analisar</title>
                      <path d="M12 20h9" />
                      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
                    </svg>
                    <span>Analisar meu CV</span>
                  </>
                )}
              </button>

              <div style={{ height: 30 }}>
                {guestAnalysisAuthGateEnabled && !isAuthenticated && (
                  <p
                    style={{
                      textAlign: "center",
                      fontFamily: MONO,
                      fontSize: 10.5,
                      color: "#8a8a85",
                      marginTop: 10,
                      letterSpacing: 0.2,
                    }}
                  >
                    Análise gratuita — crie sua conta pra ver o resultado
                    completo.
                  </p>
                )}
              </div>

              <button
                type="button"
                onClick={() => setStep(1)}
                style={{
                  display: "block",
                  margin: "0 auto",
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  fontFamily: MONO,
                  fontSize: 11,
                  color: "#8a8a85",
                  textDecoration: "underline",
                }}
              >
                ← voltar
              </button>
            </form>
          )}
        </div>
      </div>

      <style>{`
        @media (max-width: 640px) {
          .lp-f-job-grid { grid-template-columns: 1fr !important; height: 420px !important; }
        }
      `}</style>
    </>
  );
}
