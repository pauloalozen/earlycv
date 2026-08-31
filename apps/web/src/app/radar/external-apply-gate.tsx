"use client";

import { useEffect, useState } from "react";

const GEIST = "var(--font-geist), -apple-system, system-ui, sans-serif";
const MONO = "var(--font-geist-mono), monospace";

// Intercepta o clique em "Candidatar-se externamente" só pra visitante
// anônimo — usuário logado já viu o CTA de análise (AnalysisCtaButtons)
// acima na mesma sidebar, então um segundo gate aqui seria só atrito.
// A saída ("candidatar-se sem analisar") sempre existe e nunca fica
// escondida — é atrito de funil, não bloqueio.
export function ExternalApplyGate({
  href,
  company,
  jobId,
}: {
  href: string;
  company: string;
  jobId: string;
}) {
  // Cadastro primeiro, análise depois: /adaptar exige sessão, então o CTA
  // sempre passa por /entrar. O `next` carrega o jobId — assim que a conta
  // é criada, o redirect cai direto em /adaptar já com a descrição desta
  // vaga carregada (ver adaptar-client.tsx, fluxo de 1 clique via jobId).
  const analyzeHref = `/entrar?tab=cadastrar&ctx=radar&next=${encodeURIComponent(`/adaptar?jobId=${jobId}`)}`;
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  function continueExternally() {
    window.open(href, "_blank", "noopener,noreferrer");
    setOpen(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          width: "100%",
          boxSizing: "border-box",
          display: "block",
          background: "#fff",
          color: "#0a0a0a",
          border: "1px solid rgba(10,10,10,0.15)",
          borderRadius: 9,
          padding: "11px",
          fontSize: 13,
          fontWeight: 500,
          textAlign: "center",
          fontFamily: GEIST,
          marginBottom: 8,
          cursor: "pointer",
        }}
      >
        Candidatar-se externamente ↗
      </button>

      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="external-apply-gate-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") setOpen(false);
          }}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 210,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
            background: "rgba(10,10,10,0.55)",
            backdropFilter: "blur(4px)",
            animation: "external-apply-gate-backdrop 180ms ease-out",
          }}
        >
          <style>{`
            @keyframes external-apply-gate-backdrop {
              from { opacity: 0; }
              to { opacity: 1; }
            }
            @keyframes external-apply-gate-card {
              from { opacity: 0; transform: translateY(10px) scale(0.98); }
              to { opacity: 1; transform: translateY(0) scale(1); }
            }
          `}</style>
          <div
            style={{
              width: "100%",
              maxWidth: 420,
              background: "#0a0a0a",
              color: "#fafaf6",
              borderRadius: 20,
              padding: "28px 26px",
              position: "relative",
              boxShadow: "0 20px 60px -16px rgba(0,0,0,0.5)",
              animation:
                "external-apply-gate-card 220ms cubic-bezier(0.16,1,0.3,1)",
            }}
          >
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Fechar"
              style={{
                position: "absolute",
                top: 16,
                right: 16,
                width: 28,
                height: 28,
                borderRadius: "50%",
                background: "rgba(250,250,246,0.08)",
                border: "none",
                color: "#8a8a85",
                fontSize: 15,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              ✕
            </button>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 7,
                fontFamily: MONO,
                fontSize: 10,
                letterSpacing: 1.3,
                color: "#c6ff3a",
                fontWeight: 600,
                marginBottom: 16,
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: "#c6ff3a",
                  display: "inline-block",
                }}
              />
              ESPERA UM SEGUNDO
            </div>

            <div
              id="external-apply-gate-title"
              style={{
                fontSize: 22,
                fontWeight: 600,
                letterSpacing: -0.5,
                lineHeight: 1.2,
                marginBottom: 12,
                maxWidth: 340,
              }}
            >
              Antes de se candidatar, faça sua análise grátis.
            </div>

            <p
              style={{
                fontSize: 13.5,
                lineHeight: 1.6,
                color: "#c8c6bf",
                margin: "0 0 22px",
              }}
            >
              Currículo genérico não passa do primeiro filtro. Em menos de 1
              minuto o EarlyCV gera um CV específico pra essa vaga na {company}{" "}
              — destacando exatamente o que aumenta suas chances de entrevista
              antes de você se candidatar.
            </p>

            <a
              href={analyzeHref}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                width: "100%",
                boxSizing: "border-box",
                background: "#c6ff3a",
                color: "#1c2a05",
                borderRadius: 9,
                padding: "14px 16px",
                fontSize: 14,
                fontWeight: 700,
                textDecoration: "none",
                marginBottom: 8,
              }}
            >
              Criar usuário e fazer minha análise →
            </a>
            <div
              style={{
                textAlign: "center",
                fontFamily: MONO,
                fontSize: 10.5,
                color: "#6a6560",
                marginBottom: 18,
              }}
            >
              grátis · sem cartão · 1 minuto
            </div>

            <button
              type="button"
              onClick={continueExternally}
              style={{
                display: "block",
                width: "100%",
                background: "transparent",
                border: "none",
                color: "#8a8a85",
                fontSize: 12,
                textDecoration: "underline",
                textUnderlineOffset: 3,
                cursor: "pointer",
                fontFamily: GEIST,
              }}
            >
              não, prefiro me candidatar sem analisar
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
