"use client";

import { scrollCenterBelowFixedNav } from "@/lib/scroll-center-below-fixed-nav";
import { useRadarAnalysisPreview } from "./radar-analysis-preview-context";

const GEIST = "var(--font-geist), -apple-system, system-ui, sans-serif";

const SIGNUP_HREF = `/entrar?tab=cadastrar&ctx=radar&next=${encodeURIComponent(
  "/adaptar/resultado",
)}`;

// Reforço pedido explicitamente: depois de ler a descrição inteira da
// vaga, a pessoa nunca deveria ter que rolar de volta procurando o CTA —
// este bloco aparece bem no fim do conteúdo e leva de volta pro MESMO CTA
// principal da página (nunca abre um segundo fluxo).
//
// Anônimo ANTES de analisar → âncora pro bloco de análise guest
// (RadarGuestAnalysisBand, #radar-guest-analysis), com scroll
// centralizado (ver handleClick). Anônimo DEPOIS de já ver o preview
// (useRadarAnalysisPreview) → o "curtiu a vaga, veja se seu CV se
// encaixa" não faz mais sentido (a pessoa já viu que se encaixa, parcial)
// — a copy muda pra reforçar o gate de cadastro, e o CTA passa a ir direto
// pro signup, sem mais precisar rolar a página. Logado com/sem CV master →
// âncora pro CompatCard real na sidebar (#radar-compat-card), sempre por
// scroll (nunca perde a análise em andamento nesse card).
export function EndOfDescriptionCta({
  isAuthenticated,
  hasMasterCv,
}: {
  isAuthenticated: boolean;
  hasMasterCv: boolean;
}) {
  const { hasPreview } = useRadarAnalysisPreview();
  const showSignupGate = !isAuthenticated && hasPreview;

  const targetId = isAuthenticated
    ? "radar-compat-card"
    : "radar-guest-analysis";

  const title = showSignupGate
    ? "Libere sua análise completa agora mesmo, criando sua conta grátis."
    : isAuthenticated
      ? hasMasterCv
        ? "Curtiu a vaga? Veja seu match real com ela."
        : "Curtiu a vaga? Suba seu CV e veja seu match."
      : "Curtiu a vaga? Veja se seu CV se encaixa.";

  const description = showSignupGate
    ? "Seu score e os pontos de melhoria já estão prontos lá em cima — só falta criar a conta pra ver tudo."
    : isAuthenticated
      ? "Role pra cima e analise seu CV Master contra essa vaga específica."
      : "Sobe seu currículo lá em cima e receba seu score em segundos.";

  function handleClick(e: React.MouseEvent<HTMLAnchorElement>) {
    if (showSignupGate) return; // navegação normal pro signup
    const target = document.getElementById(targetId);
    if (!target) return;
    e.preventDefault();
    scrollCenterBelowFixedNav(target);
  }

  return (
    <a
      href={showSignupGate ? SIGNUP_HREF : `#${targetId}`}
      onClick={handleClick}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 16,
        background: "#0a0a0a",
        borderRadius: 16,
        padding: "22px 26px",
        textDecoration: "none",
        color: "#fafaf6",
        marginTop: 8,
        marginBottom: 20,
      }}
    >
      <div>
        <div
          style={{
            fontFamily: GEIST,
            fontWeight: 700,
            fontSize: 15,
            marginBottom: 4,
          }}
        >
          {title}
        </div>
        <div style={{ fontSize: 12.5, color: "#a8a6a0" }}>{description}</div>
      </div>
      <div
        style={{
          flexShrink: 0,
          width: 38,
          height: 38,
          borderRadius: "50%",
          background: "#c6ff3a",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {showSignupGate ? (
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#16210a"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <title>Criar conta grátis</title>
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        ) : (
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#16210a"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <title>Voltar ao topo</title>
            <path d="M12 19V5M5 12l7-7 7 7" />
          </svg>
        )}
      </div>
    </a>
  );
}
