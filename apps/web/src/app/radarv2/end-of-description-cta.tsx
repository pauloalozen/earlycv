"use client";

const GEIST = "var(--font-geist), -apple-system, system-ui, sans-serif";

// Fase 1.1 (Radar v2) — reforço pedido explicitamente: depois de ler a
// descrição inteira da vaga, a pessoa nunca deveria ter que rolar de volta
// procurando o CTA — este bloco aparece bem no fim do conteúdo e leva de
// volta pro MESMO CTA principal da página (nunca abre um segundo fluxo).
// Anônimo → âncora pro bloco de análise guest (RadarGuestAnalysisBandV2,
// #radar-guest-analysis). Logado com CV master → âncora pro CompatCard real
// na sidebar (#radarv2-compat-card). Logado sem CV master → mesma âncora,
// o CompatCard já mostra o CTA de completar o perfil nesse estado.
//
// scrollIntoView({block:"center"}) em vez de deixar o navegador seguir o
// href de verdade: a navegação padrão de âncora sempre alinha o alvo no
// topo do viewport (respeitando só scrollMarginTop) — como o card de
// análise é mais alto que a tela em telas menores, isso deixava o CTA
// (que é o motivo de estar voltando pra lá) cortado fora da área visível.
// Centralizar o card resolve isso sem depender de scrollMarginTop.
export function EndOfDescriptionCta({
  isAuthenticated,
  hasMasterCv,
}: {
  isAuthenticated: boolean;
  hasMasterCv: boolean;
}) {
  const targetId = isAuthenticated
    ? "radarv2-compat-card"
    : "radar-guest-analysis";
  const title = isAuthenticated
    ? hasMasterCv
      ? "Curtiu a vaga? Veja seu match real com ela."
      : "Curtiu a vaga? Suba seu CV e veja seu match."
    : "Curtiu a vaga? Veja se seu CV se encaixa.";
  const description = isAuthenticated
    ? "Role pra cima e analise seu CV Master contra essa vaga específica."
    : "Sobe seu currículo lá em cima e receba seu score em segundos.";

  function handleClick(e: React.MouseEvent<HTMLAnchorElement>) {
    const target = document.getElementById(targetId);
    if (!target) return;
    e.preventDefault();
    target.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  return (
    <a
      href={`#${targetId}`}
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
      </div>
    </a>
  );
}
