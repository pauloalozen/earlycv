import Link from "next/link";

export const GEIST = "var(--font-geist), -apple-system, system-ui, sans-serif";
export const MONO = "var(--font-geist-mono), monospace";
export const SERIF_ITALIC = "var(--font-instrument-serif), serif";

export const FEATURE_PAGES = [
  { href: "/analise-de-curriculo", label: "Análise de Currículo" },
  { href: "/radar-de-vagas", label: "Radar de Vagas" },
  { href: "/gestao-de-candidaturas", label: "Gestão de Candidaturas" },
  { href: "/carta-de-apresentacao", label: "Carta de Apresentação" },
  { href: "/preparacao-para-entrevista", label: "Preparação para Entrevista" },
] as const;

export const container: React.CSSProperties = {
  width: "100%",
  maxWidth: 1120,
  margin: "0 auto",
  padding: "0 32px",
};

export const sectionLabelStyle: React.CSSProperties = {
  fontFamily: MONO,
  fontSize: 11,
  fontWeight: 500,
  letterSpacing: 1.4,
  textTransform: "uppercase",
  color: "#8a8a85",
};

export const btnPrimary: React.CSSProperties = {
  background: "#0a0a0a",
  color: "#fff",
  borderRadius: 10,
  padding: "14px 22px",
  fontSize: 14.5,
  fontWeight: 500,
  display: "inline-flex",
  alignItems: "center",
  gap: 10,
  letterSpacing: -0.1,
  boxShadow:
    "0 4px 12px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.08)",
  fontFamily: GEIST,
  whiteSpace: "nowrap",
};

export const btnGhost: React.CSSProperties = {
  background: "transparent",
  color: "#0a0a0a",
  fontSize: 14,
  fontWeight: 500,
  padding: 14,
  textDecoration: "underline",
  textDecorationColor: "rgba(10,10,10,0.2)",
  textUnderlineOffset: 4,
  fontFamily: GEIST,
};

export const btnOutlineDark: React.CSSProperties = {
  border: "1px solid rgba(250,250,246,0.22)",
  color: "#fafaf6",
  background: "transparent",
  borderRadius: 10,
  padding: "13px 22px",
  fontSize: 14,
  fontWeight: 500,
  fontFamily: GEIST,
};

export const browserFrame: React.CSSProperties = {
  background: "#fff",
  borderRadius: 14,
  overflow: "hidden",
  boxShadow:
    "0 30px 70px -24px rgba(10,10,10,0.35), 0 1px 2px rgba(10,10,10,0.06)",
  border: "1px solid rgba(10,10,10,0.06)",
};

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div style={sectionLabelStyle}>{children}</div>;
}

export function BrowserChrome() {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "10px 14px",
        background: "#f2f2ee",
        borderBottom: "1px solid rgba(10,10,10,0.06)",
      }}
    >
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: "rgba(10,10,10,0.14)",
          }}
        />
      ))}
    </div>
  );
}

/** Horizontal step flow — "Vaga → Análise → CV → Candidatura", etc. */
export function FlowDiagram({
  steps,
  variant = "light",
}: {
  steps: string[];
  variant?: "light" | "dark";
}) {
  const dark = variant === "dark";
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        flexWrap: "wrap",
        gap: 10,
        justifyContent: "center",
      }}
    >
      {steps.map((step, i) => (
        <div
          key={step}
          style={{ display: "flex", alignItems: "center", gap: 10 }}
        >
          {i > 0 && (
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke={dark ? "#6a6a66" : "#c4c3bd"}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <title>então</title>
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          )}
          <div
            style={{
              background: dark ? "rgba(250,250,246,0.06)" : "#fafaf6",
              border: dark
                ? "1px solid rgba(250,250,246,0.12)"
                : "1px solid rgba(10,10,10,0.1)",
              borderRadius: 12,
              padding: "12px 18px",
              fontSize: 13.5,
              fontWeight: 500,
              color: dark ? "#fafaf6" : "#0a0a0a",
              whiteSpace: "nowrap",
            }}
          >
            {step}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Nav shared by the landing pages (default + per-feature). CSS-only "Produtos" dropdown. */
export function PublicNav() {
  return (
    <nav
      className="lp-nav-shared"
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "18px 32px",
        position: "sticky",
        top: 0,
        zIndex: 20,
        background: "rgba(255,255,255,0.9)",
        backdropFilter: "blur(6px)",
        borderBottom: "1px solid rgba(10,10,10,0.06)",
      }}
    >
      <Link
        href="/"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          textDecoration: "none",
        }}
      >
        <svg
          width="17"
          height="17"
          viewBox="0 0 40 40"
          fill="none"
          aria-hidden="true"
        >
          <title>earlyCV</title>
          <rect x="0" y="0" width="12" height="6.5" rx="2" fill="#0a0a0a" />
          <rect x="16" y="0" width="12" height="6.5" rx="2" fill="#0a0a0a" />
          <rect x="32" y="0" width="8" height="6.5" rx="2" fill="#c6ff3a" />
          <rect x="0" y="11.2" width="16" height="6.5" rx="2" fill="#c6ff3a" />
          <rect x="20" y="11.2" width="18" height="6.5" rx="2" fill="#0a0a0a" />
          <rect x="0" y="22.4" width="7" height="6.5" rx="2" fill="#0a0a0a" />
          <rect x="11" y="22.4" width="16" height="6.5" rx="2" fill="#c6ff3a" />
          <rect x="30" y="22.4" width="8" height="6.5" rx="2" fill="#0a0a0a" />
          <rect x="0" y="33.5" width="22" height="6.5" rx="2" fill="#0a0a0a" />
          <rect
            x="26"
            y="33.5"
            width="9"
            height="6.5"
            rx="2"
            fill="rgba(10,10,10,0.14)"
          />
        </svg>
        <span style={{ fontSize: 17, letterSpacing: -0.6, lineHeight: 1 }}>
          <span style={{ fontWeight: 300 }}>early</span>
          <span style={{ fontWeight: 700 }}>CV</span>
        </span>
        <span
          style={{
            fontFamily: MONO,
            fontSize: 10,
            color: "#8a8a85",
            border: "1px solid #d8d6ce",
            borderRadius: 3,
            padding: "1px 5px",
            fontWeight: 500,
            marginLeft: 2,
          }}
        >
          v2.1
        </span>
      </Link>

      <div style={{ display: "flex", alignItems: "center", gap: 26 }}>
        <Link href="/#como-funciona" style={{ fontSize: 13, color: "#3a3a38" }}>
          Como funciona
        </Link>

        <div className="lp-nav-dropdown">
          <span style={{ fontSize: 13, color: "#3a3a38", cursor: "default" }}>
            Produtos
            <svg
              width="10"
              height="10"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#3a3a38"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ marginLeft: 5, verticalAlign: "middle" }}
            >
              <title>abrir menu</title>
              <path d="M6 9l6 6 6-6" />
            </svg>
          </span>
          <div className="lp-nav-dropdown-panel">
            {FEATURE_PAGES.map((p) => (
              <Link key={p.href} href={p.href} className="lp-nav-dropdown-item">
                {p.label}
              </Link>
            ))}
          </div>
        </div>

        <Link href="/#faq" style={{ fontSize: 13, color: "#3a3a38" }}>
          Perguntas
        </Link>
        <Link href="/entrar" style={{ fontSize: 13, color: "#3a3a38" }}>
          Entrar
        </Link>
        <Link
          href="/adaptar"
          style={{
            ...btnPrimary,
            padding: "0 16px",
            height: 34,
            borderRadius: 8,
            fontSize: 12.5,
          }}
        >
          Analisar meu CV grátis
        </Link>
      </div>

      <style>{`
        .lp-nav-dropdown { position: relative; padding: 4px 0; }
        .lp-nav-dropdown-panel {
          position: absolute; top: 100%; left: 50%; transform: translateX(-50%) translateY(4px);
          background: #fff; border: 1px solid rgba(10,10,10,0.08); border-radius: 12px;
          box-shadow: 0 20px 40px -12px rgba(10,10,10,0.18);
          padding: 8px; display: flex; flex-direction: column; min-width: 220px;
          opacity: 0; pointer-events: none; transition: opacity 160ms ease, transform 160ms ease;
        }
        .lp-nav-dropdown:hover .lp-nav-dropdown-panel,
        .lp-nav-dropdown:focus-within .lp-nav-dropdown-panel {
          opacity: 1; pointer-events: auto; transform: translateX(-50%) translateY(8px);
        }
        .lp-nav-dropdown-item {
          font-size: 13.5px; color: #3a3a38; padding: 9px 12px; border-radius: 8px; white-space: nowrap;
        }
        .lp-nav-dropdown-item:hover { background: #f7f7f4; opacity: 1; }
        @media (max-width: 900px) {
          .lp-nav-shared > div:last-child > a:not(:last-child),
          .lp-nav-shared .lp-nav-dropdown { display: none; }
        }
      `}</style>
    </nav>
  );
}

/** Shared CSS for kicker / pills / marquee / reveal-card / feature tiles across landing pages. */
export function LandingSharedStyles() {
  return (
    <style>{`
      .lp-kicker {
        display: inline-flex; align-items: center; gap: 8px;
        font-family: ${MONO}; font-size: 10.5px; letter-spacing: 1.2px; font-weight: 500;
        color: #555; background: rgba(10,10,10,0.04); border: 1px solid rgba(10,10,10,0.06);
        padding: 6px 10px; border-radius: 999px;
      }
      .lp-marquee-mask {
        width: 100%; overflow: hidden;
        -webkit-mask-image: linear-gradient(90deg, transparent, #000 10%, #000 90%, transparent);
        mask-image: linear-gradient(90deg, transparent, #000 10%, #000 90%, transparent);
      }
      .lp-marquee-track { display: flex; align-items: center; gap: 14px; width: max-content; animation: lp-marquee-scroll 34s linear infinite; }
      .lp-marquee-track:hover { animation-play-state: paused; }
      @keyframes lp-marquee-scroll { from { transform: translateX(0); } to { transform: translateX(-50%); } }
      .lp-company-badge { flex-shrink: 0; padding: 0 22px; }
      .lp-company-badge span { font-family: ${GEIST}; font-size: 16px; font-weight: 500; letter-spacing: -0.2px; color: #6a6a66; white-space: nowrap; }

      .lp-feature-tile { background: #fafaf6; border: 1px solid rgba(10,10,10,0.08); border-radius: 16px; padding: 20px; display: flex; flex-direction: column; gap: 14px; }
      .lp-thumb {
        border-radius: 10px; overflow: hidden; border: 1px solid rgba(10,10,10,0.06); aspect-ratio: 16/11.5;
        background: #f0efe9; display: flex; align-items: center; justify-content: center; padding: 12px;
      }
      .lp-thumb img { width: 100%; height: 100%; object-fit: contain; display: block; }

      .reveal-card { opacity: 0; transform: translateY(24px); transition: opacity 0.52s cubic-bezier(.25,.46,.45,.94), transform 0.52s cubic-bezier(.25,.46,.45,.94); }
      .reveal-card.reveal-visible { opacity: 1; transform: translateY(0); }
      .how-card-featured { transform: translateY(18px); }
      .how-card-featured.reveal-visible { transform: translateY(-6px); }

      @media (max-width: 900px) {
        .lp-grid-2 { grid-template-columns: 1fr !important; }
        .lp-grid-3 { grid-template-columns: 1fr !important; }
        .lp-order-1 { order: 1; }
        .lp-order-2 { order: 2; }
      }
      @media (max-width: 640px) {
        .reveal-card { transform: translateX(24px); }
        .reveal-card.reveal-visible { transform: translateX(0); }
      }
    `}</style>
  );
}
