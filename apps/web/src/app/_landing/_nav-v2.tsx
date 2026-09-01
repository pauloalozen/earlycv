import Link from "next/link";
import { Logo } from "@/components/logo";
import { LandingMobileMenu } from "../_landing-mobile-menu";
import { btnPrimary, FEATURE_PAGES } from "./_shared";

/** Ubuntu-based tokens — matches the main landing (variant-f-v2) exactly. */
export const GEIST_V2 =
  'var(--font-ubuntu), -apple-system, "Segoe UI", system-ui, sans-serif';
export const MONO_V2 =
  'var(--font-ubuntu-mono), ui-monospace, "SF Mono", Menlo, monospace';
export const SERIF_ITALIC_V2 = "var(--font-instrument-serif), serif";

/** Nav label override — canonical product name is "Radar de Oportunidades";
 * FEATURE_PAGES (shared across the site) still says "Radar de Vagas". */
function navDropdownLabel(p: (typeof FEATURE_PAGES)[number]) {
  return p.href === "/radar-de-vagas" ? "Radar de Oportunidades" : p.label;
}

/** Mobile menu panel content — same links as the "Produtos" dropdown plus
 * the in-page anchors, which point back at the home page since these
 * marketing pages don't have their own "como funciona"/"faq" sections. */
const MOBILE_MENU_LINKS = [
  ...FEATURE_PAGES.map((p) => ({ href: p.href, label: navDropdownLabel(p) })),
  { href: "/#como-funciona", label: "Como funciona" },
  { href: "/#faq", label: "Perguntas" },
];

/**
 * Fixed nav used by the main landing (variant-f-v2) — copied here so the
 * feature marketing pages can match it exactly without risking any change
 * to the already-finalized main landing itself.
 */
export function LandingNavV2({
  isAuthenticated = false,
}: {
  isAuthenticated?: boolean;
}) {
  return (
    <>
      <nav
        style={{
          display: "grid",
          gridTemplateColumns: "1fr auto 1fr",
          alignItems: "center",
          gap: 16,
          padding: "18px 32px",
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 20,
          background: "rgba(255,255,255,0.9)",
          backdropFilter: "blur(6px)",
        }}
      >
        <Link
          href="/"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            textDecoration: "none",
            justifySelf: "start",
            gridColumn: 1,
          }}
        >
          <Logo />
          <span
            style={{
              fontFamily: MONO_V2,
              fontSize: 10,
              color: "#8a8a85",
              border: "1px solid #d8d6ce",
              borderRadius: 3,
              padding: "1px 5px",
              fontWeight: 400,
            }}
          >
            v2.1
          </span>
        </Link>

        <div
          className="lp-fv2-nav-links"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 26,
            justifySelf: "center",
            gridColumn: 2,
          }}
        >
          <div className="lp-fv2-nav-dropdown">
            <span
              className="lp-fv2-nav-dropdown-trigger"
              style={{ fontSize: 13, color: "#3a3a38", cursor: "default" }}
            >
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
              >
                <title>abrir menu</title>
                <path d="M6 9l6 6 6-6" />
              </svg>
            </span>
            <div className="lp-fv2-nav-dropdown-panel">
              <div className="lp-fv2-nav-dropdown-grid">
                {FEATURE_PAGES.map((p) => (
                  <Link
                    key={p.href}
                    href={p.href}
                    className="lp-fv2-nav-dropdown-item"
                  >
                    <span className="lp-fv2-nav-dropdown-icon">
                      <svg
                        width="15"
                        height="15"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="#0a0a0a"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <title>{navDropdownLabel(p)}</title>
                        <path d={p.icon} />
                      </svg>
                    </span>
                    <span>
                      <span className="lp-fv2-nav-dropdown-label">
                        {navDropdownLabel(p)}
                      </span>
                      <span className="lp-fv2-nav-dropdown-desc">
                        {p.description}
                      </span>
                    </span>
                  </Link>
                ))}
              </div>
              <div className="lp-fv2-nav-dropdown-cta-row">
                <Link href="/adaptar" className="lp-fv2-nav-dropdown-cta">
                  Analisar meu CV grátis
                </Link>
              </div>
            </div>
          </div>
          <Link
            href="/#como-funciona"
            style={{ fontSize: 13, color: "#3a3a38" }}
          >
            Como funciona
          </Link>
          <Link href="/#faq" style={{ fontSize: 13, color: "#3a3a38" }}>
            Perguntas
          </Link>
        </div>

        <div
          className="lp-fv2-nav-right"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 26,
            justifySelf: "end",
            gridColumn: 3,
          }}
        >
          {!isAuthenticated && (
            <Link
              href="/entrar"
              className="lp-fv2-nav-entrar"
              style={{ fontSize: 13, color: "#3a3a38" }}
            >
              Entrar
            </Link>
          )}
          <Link
            href={isAuthenticated ? "/meu-perfil" : "/entrar?tab=cadastro"}
            className="lp-fv2-nav-profile"
            style={{
              ...btnPrimary,
              padding: "0 16px",
              height: 34,
              borderRadius: 8,
              fontSize: 12.6,
            }}
          >
            {isAuthenticated ? "Meu Perfil" : "Criar conta"}
          </Link>
          <LandingMobileMenu
            authState={isAuthenticated ? "authenticated" : "unauthenticated"}
            links={
              isAuthenticated
                ? MOBILE_MENU_LINKS
                : [...MOBILE_MENU_LINKS, { href: "/entrar", label: "Entrar" }]
            }
            ctaAuthenticated={{ href: "/meu-perfil", label: "Meu Perfil" }}
            ctaUnauthenticated={{
              href: "/entrar?tab=cadastro",
              label: "Analisar meu CV grátis",
            }}
            panelBackground="#fff"
          />
        </div>
      </nav>

      <style>{`
        .lp-fv2-nav-dropdown { position: relative; display: flex; align-items: center; }
        .lp-fv2-nav-dropdown-trigger { display: inline-flex; align-items: center; gap: 5px; line-height: 1; cursor: default; }
        .lp-fv2-nav-dropdown-panel {
          position: fixed; top: 72px; left: 50%; transform: translateX(-50%) scale(0.98);
          transform-origin: top center;
          background: #fff; border: 1px solid rgba(10,10,10,0.08); border-radius: 16px;
          box-shadow: 0 24px 48px -12px rgba(10,10,10,0.2);
          padding: 22px; display: flex; flex-direction: column; gap: 6px; min-width: 620px;
          opacity: 0; pointer-events: none; transition: opacity 140ms ease, transform 140ms ease;
        }
        .lp-fv2-nav-dropdown-panel::before {
          content: ""; position: absolute; left: 0; right: 0; top: -32px; height: 32px;
        }
        .lp-fv2-nav-dropdown:hover .lp-fv2-nav-dropdown-panel,
        .lp-fv2-nav-dropdown:focus-within .lp-fv2-nav-dropdown-panel {
          opacity: 1; pointer-events: auto; transform: translateX(-50%) scale(1);
        }
        .lp-fv2-nav-dropdown-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px 18px; }
        .lp-fv2-nav-dropdown-item {
          display: flex; align-items: flex-start; gap: 14px; padding: 14px 16px; border-radius: 12px;
        }
        .lp-fv2-nav-dropdown-item:hover { background: #f7f7f4; }
        .lp-fv2-nav-dropdown-icon {
          flex-shrink: 0; width: 32px; height: 32px; border-radius: 9px;
          background: rgba(198,255,58,0.24); display: flex; align-items: center; justify-content: center;
        }
        .lp-fv2-nav-dropdown-label { display: block; font-size: 13.5px; font-weight: 500; color: #0a0a0a; white-space: nowrap; }
        .lp-fv2-nav-dropdown-desc { display: block; font-size: 12px; color: #8a8a85; margin-top: 3px; line-height: 1.4; }
        .lp-fv2-nav-dropdown-cta-row { display: flex; justify-content: center; border-top: 1px solid rgba(10,10,10,0.06); padding-top: 16px; }
        .lp-fv2-nav-dropdown-cta {
          display: inline-flex; align-items: center; justify-content: center; gap: 8px;
          background: #0a0a0a; color: #fff; font-size: 13.5px; font-weight: 500;
          border-radius: 10px; padding: 11px 22px;
        }
        .lp-fv2-kicker {
          display: inline-flex; align-items: center; gap: 8px;
          font-family: ${MONO_V2}; font-size: 10.5px; letter-spacing: 1.2px; font-weight: 500;
          color: #555; background: rgba(10,10,10,0.04); border: 1px solid rgba(10,10,10,0.06);
          padding: 6px 10px; border-radius: 999px;
        }
        @media (max-width: 768px) {
          .lp-fv2-nav-links { display: none !important; }
          .lp-fv2-nav-entrar { display: none !important; }
          .lp-fv2-nav-profile { display: none !important; }
        }
      `}</style>
    </>
  );
}
