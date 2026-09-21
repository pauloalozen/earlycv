import { isJobsGhostModeEnabled } from "@/lib/jobs-ghost-mode";

const SIGNUP_NEXT_MONITOR = `/entrar?tab=cadastrar&ctx=radar&next=${encodeURIComponent("/alerta-vaga-certa")}`;

// Fase 1.1 (Radar v2) — mesmo destaque de radar/[slug]/page.tsx
// (MonitorHighlightBand, v1), achatado numa faixa discreta pelo mesmo
// motivo do FeatureShowcaseStripV2: o Monitor continua existindo e sendo
// promovido, só não compete mais visualmente com o CTA principal de
// análise+cadastro.
export function MonitorHighlightBandV2() {
  if (isJobsGhostModeEnabled()) return null;

  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid rgba(10,10,10,0.08)",
        borderRadius: 12,
        padding: "14px 18px",
        display: "flex",
        alignItems: "center",
        gap: 14,
      }}
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#0a0a0a"
        strokeWidth="1.8"
        style={{ flexShrink: 0 }}
      >
        <title>Alerta de Vaga Certa</title>
        <path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 01-3.46 0" />
      </svg>
      <div style={{ flex: 1, fontSize: 12.5, color: "#3a3a35" }}>
        <strong>Quer saber de vagas parecidas antes de todo mundo?</strong> O
        Alerta de Vaga Certa avisa por e-mail assim que sair.
      </div>
      <a
        href={SIGNUP_NEXT_MONITOR}
        style={{ fontSize: 12, color: "#0a0a0a", flexShrink: 0 }}
      >
        Ativar grátis
      </a>
    </div>
  );
}
