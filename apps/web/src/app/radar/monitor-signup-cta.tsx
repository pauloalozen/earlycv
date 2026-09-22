import { isJobsGhostModeEnabled } from "@/lib/jobs-ghost-mode";

const GEIST = "var(--font-geist), -apple-system, system-ui, sans-serif";
const MONO = "var(--font-geist-mono), monospace";

const SIGNUP_NEXT_MONITOR = `/entrar?tab=cadastrar&ctx=radar&next=${encodeURIComponent("/alerta-vaga-certa")}`;

// Fica no fim da descrição, antes do reforço/sidebar — única promoção do
// Monitor que existe na página (não tem mais card na sidebar nem faixa no
// rodapé), então precisa chamar atenção de verdade, com cor.
export function MonitorSignupCta() {
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
