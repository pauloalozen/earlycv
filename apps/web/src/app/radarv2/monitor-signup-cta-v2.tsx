import { isJobsGhostModeEnabled } from "@/lib/jobs-ghost-mode";

const GEIST = "var(--font-geist), -apple-system, system-ui, sans-serif";
const MONO = "var(--font-geist-mono), monospace";

const SIGNUP_NEXT_MONITOR = `/entrar?tab=cadastrar&ctx=radar&next=${encodeURIComponent("/alerta-vaga-certa")}`;

// Fase 1.1 (Radar v2) — substitui FeatureShowcaseStripV2 nesta posição
// (fim da descrição, antes do reforço/sidebar): a vitrine genérica do
// EarlyCV ("também no EarlyCV") virou este CTA único do Monitor, agora com
// cor de verdade (a única promoção de Monitor que resta na página, depois
// de remover o card da sidebar e a faixa do rodapé) — precisa chamar
// atenção, não pode ficar no mesmo cinza-morto do resto dos blocos
// secundários.
export function MonitorSignupCtaV2() {
  if (isJobsGhostModeEnabled()) return null;

  return (
    <div
      style={{
        background: "linear-gradient(135deg, #0a0a0a 0%, #16210a 100%)",
        border: "1px solid rgba(198,255,58,0.25)",
        borderRadius: 14,
        padding: "20px 24px",
        display: "flex",
        alignItems: "center",
        gap: 20,
        flexWrap: "wrap",
        marginTop: 4,
      }}
    >
      <div style={{ flex: 1, minWidth: 220 }}>
        <div
          style={{
            fontFamily: MONO,
            fontSize: 10,
            letterSpacing: 1.2,
            color: "#c6ff3a",
            fontWeight: 600,
            marginBottom: 6,
          }}
        >
          ALERTA DE VAGA CERTA
        </div>
        <div
          style={{
            fontFamily: GEIST,
            fontWeight: 700,
            fontSize: 16,
            color: "#fafaf6",
            lineHeight: 1.3,
          }}
        >
          Quer receber vagas como essa antes da multidão do LinkedIn? De graça.
        </div>
      </div>
      <a
        href={SIGNUP_NEXT_MONITOR}
        style={{
          flexShrink: 0,
          background: "#c6ff3a",
          color: "#16210a",
          borderRadius: 10,
          padding: "13px 22px",
          fontFamily: GEIST,
          fontSize: 13.5,
          fontWeight: 700,
          textDecoration: "none",
          whiteSpace: "nowrap",
        }}
      >
        Criar conta grátis
      </a>
    </div>
  );
}
