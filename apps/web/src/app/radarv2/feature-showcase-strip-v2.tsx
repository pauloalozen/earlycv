const MONO = "var(--font-geist-mono), monospace";

// Fase 1.1 (Radar v2) — mesma vitrine de radar/[slug]/page.tsx
// (FeatureShowcaseStrip, v1), mas achatada numa faixa discreta: o objetivo
// desta página passa a ser análise+cadastro, então "o resto do EarlyCV"
// deixa de ter um card preto do mesmo peso visual do CTA principal e vira
// uma linha de texto — continua existindo, só não compete mais.
export function FeatureShowcaseStripV2() {
  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid rgba(10,10,10,0.08)",
        borderRadius: 12,
        padding: "14px 18px",
        display: "flex",
        alignItems: "center",
        gap: 16,
        flexWrap: "wrap",
        marginTop: 4,
      }}
    >
      <div
        style={{
          fontFamily: MONO,
          fontSize: 9.5,
          letterSpacing: 0.6,
          color: "#8a8a85",
          flexShrink: 0,
        }}
      >
        TAMBÉM NO EARLYCV
      </div>
      <div
        style={{
          display: "flex",
          gap: 16,
          flex: 1,
          fontSize: 12,
          color: "#4a4a45",
          flexWrap: "wrap",
        }}
      >
        <span>✦ Carta de apresentação automática</span>
        <span>✦ Preparação de entrevista</span>
        <span>✦ Gestão de candidaturas</span>
      </div>
      <a
        href="/entrar?tab=cadastrar&ctx=radar"
        style={{ fontSize: 12, color: "#0a0a0a", flexShrink: 0 }}
      >
        Criar conta grátis
      </a>
    </div>
  );
}
