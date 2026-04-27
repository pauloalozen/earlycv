import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Logo } from "@/components/logo";
import { PageShell } from "@/components/page-shell";
import { getRouteAccessRedirectPath } from "@/lib/app-session";
import { getCurrentAppUserFromCookies } from "@/lib/app-session.server";
import { GoogleAuthButton } from "./google-auth-button";
import { LoginForm } from "./login-form";
import { RegisterForm } from "./register-form";

export const metadata: Metadata = {
  robots: { follow: false, index: false },
  title: "Criar conta | EarlyCV",
};

type EntrarPageProps = {
  searchParams: Promise<{ tab?: string; error?: string; next?: string }>;
};

const GEIST = "var(--font-geist), -apple-system, system-ui, sans-serif";
const MONO = "var(--font-geist-mono), monospace";
const SERIF_ITALIC = "var(--font-instrument-serif), serif";

export default async function EntrarPage({ searchParams }: EntrarPageProps) {
  const user = await getCurrentAppUserFromCookies();
  const redirectPath = getRouteAccessRedirectPath("/entrar", user);
  if (redirectPath) redirect(redirectPath);

  const params = await searchParams;
  const tab = params.tab === "entrar" ? "entrar" : "cadastro";
  const error = params.error ?? "";
  const next = params.next ?? "";

  const isLogin = tab === "entrar";
  const googleUrl = `${process.env.NEXT_PUBLIC_API_URL?.trim()}/auth/google/start${next ? `?next=${encodeURIComponent(next)}` : ""}`;

  return (
    <PageShell>
      <main
        style={{
          fontFamily: GEIST,
          minHeight: "100dvh",
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          position: "relative",
          background: "#ecebe5",
        }}
        className="entrar-grid"
      >
        {/* Grain */}
        <div
          aria-hidden
          style={{
            position: "fixed",
            inset: 0,
            pointerEvents: "none",
            opacity: 0.4,
            mixBlendMode: "multiply",
            zIndex: 1,
            backgroundImage: `url("data:image/svg+xml;utf8,<svg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.03 0'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>")`,
          }}
        />

        {/* ── Painel esquerdo — brand ── */}
        <div
          style={{
            background: "#0a0a0a",
            color: "#f0efe9",
            padding: "32px 56px",
            display: "flex",
            flexDirection: "column",
            position: "relative",
            zIndex: 2,
            minHeight: "100dvh",
          }}
          className="entrar-left"
        >
          {/* Top nav */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <a
              href="/"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                textDecoration: "none",
              }}
            >
              <Logo variant="dark" />
              <span
                style={{
                  fontFamily: MONO,
                  fontSize: 10,
                  color: "#555",
                  border: "1px solid #333",
                  borderRadius: 3,
                  padding: "1px 5px",
                  fontWeight: 500,
                }}
              >
                v1.2
              </span>
            </a>
            <span
              style={{
                fontFamily: MONO,
                fontSize: 10.5,
                letterSpacing: 1,
                color: "#8a8a85",
              }}
            >
              PT · BR
            </span>
          </div>

          {/* Body */}
          <div
            className="entrar-body"
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              maxWidth: 440,
              paddingLeft: 40,
            }}
          >
            <div
              className="entrar-badge"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                fontFamily: MONO,
                fontSize: 10.5,
                letterSpacing: 1.2,
                color: "#8a8a85",
                marginBottom: 22,
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: "#c6ff3a",
                  boxShadow: "0 0 6px #c6ff3a",
                  display: "inline-block",
                }}
              />
              {isLogin ? "ENTRAR" : "CRIAR CONTA"}
            </div>

            <h1
              className="entrar-h1"
              style={{
                fontSize: "clamp(40px, 4vw, 64px)",
                fontWeight: 500,
                letterSpacing: -2.5,
                lineHeight: 0.98,
                color: "#fafaf6",
                marginBottom: 22,
                margin: "0 0 22px",
              }}
            >
              {isLogin ? (
                <>
                  Bem-vindo
                  <br />
                  <em
                    style={{
                      fontFamily: SERIF_ITALIC,
                      fontStyle: "italic",
                      fontWeight: 400,
                    }}
                  >
                    de volta.
                  </em>
                </>
              ) : (
                <>
                  Comece
                  <br />
                  <em
                    style={{
                      fontFamily: SERIF_ITALIC,
                      fontStyle: "italic",
                      fontWeight: 400,
                    }}
                  >
                    agora.
                  </em>
                </>
              )}
            </h1>

            <p
              className="entrar-desc"
              style={{
                fontSize: 15.5,
                lineHeight: 1.55,
                color: "#a8a8a0",
                marginBottom: 36,
              }}
            >
              {isLogin
                ? "Continue de onde parou. Seus CVs e vagas analisadas seguem esperando."
                : "Grátis. Sem cartão. Menos de 1 minuto para criar sua conta e adaptar seu CV."}
            </p>

            {/* Receipt */}
            <div
              className="entrar-receipt"
              style={{
                borderTop: "1px solid rgba(250,250,246,0.12)",
                paddingTop: 16,
              }}
            >
              {[
                { k: "SESSÃO", v: "encrypted · Seus dados protegidos" },
                { k: "DADOS", v: "não são usados para treinar modelos" },
                { k: "ANÁLISES", v: "feedback prático para melhorar seu CV" },
              ].map((row) => (
                <div
                  key={row.k}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontFamily: MONO,
                    fontSize: 11,
                    padding: "6px 0",
                  }}
                >
                  <span style={{ color: "#7a7a74", letterSpacing: 0.6 }}>
                    {row.k}
                  </span>
                  <span style={{ color: "#d8d7cf" }}>{row.v}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Footer */}
          <div
            className="entrar-footer"
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontFamily: MONO,
              fontSize: 10.5,
              color: "#6a6a64",
              letterSpacing: 0.3,
            }}
          >
            <span>© earlyCV · 2026</span>
            <span>v1.2 · status ● operational</span>
          </div>
        </div>

        {/* ── Painel direito — form ── */}
        <div
          style={{
            background: "#fafaf6",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            position: "relative",
            zIndex: 2,
            padding: "40px 32px",
            minHeight: "100dvh",
          }}
          className="entrar-right"
        >
          <div style={{ width: "100%", maxWidth: 380 }}>
            <h2
              className="entrar-form-title"
              style={{
                fontSize: 28,
                fontWeight: 500,
                letterSpacing: -1,
                marginBottom: 6,
                color: "#0a0a0a",
              }}
            >
              {isLogin ? "Entrar na conta" : "Criar conta grátis"}
            </h2>
            <p
              style={{
                fontSize: 14,
                color: "#6a6560",
                marginBottom: 28,
                lineHeight: 1.5,
              }}
            >
              {isLogin
                ? "Use seu email ou continue com Google."
                : "Use seu email ou continue com Google."}
            </p>

            {/* Error */}
            {error && (
              <div
                style={{
                  marginBottom: 20,
                  padding: "10px 14px",
                  background: "#fee2e2",
                  border: "1px solid #fecaca",
                  borderRadius: 8,
                  fontFamily: MONO,
                  fontSize: 12,
                  color: "#991b1b",
                }}
              >
                {error}
              </div>
            )}

            {/* Google — primeiro */}
            <GoogleAuthButton href={googleUrl} next={next} />

            {/* Divider */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                marginBottom: 22,
              }}
            >
              <div style={{ flex: 1, height: 1, background: "#d8d6ce" }} />
              <span
                style={{
                  fontFamily: MONO,
                  fontSize: 9.5,
                  letterSpacing: 1.2,
                  color: "#8a8a85",
                  fontWeight: 500,
                }}
              >
                OU COM EMAIL
              </span>
              <div style={{ flex: 1, height: 1, background: "#d8d6ce" }} />
            </div>

            {/* Form */}
            {isLogin ? <LoginForm next={next} /> : <RegisterForm next={next} />}

            {/* Tab switch */}
            <p
              style={{
                textAlign: "center",
                fontSize: 13,
                color: "#6a6560",
                marginTop: 20,
              }}
            >
              {isLogin ? (
                <>
                  Não tem conta?{" "}
                  <a
                    href={`/entrar?tab=cadastro${next ? `&next=${encodeURIComponent(next)}` : ""}`}
                    style={{
                      color: "#0a0a0a",
                      fontWeight: 500,
                      textDecoration: "underline",
                      textUnderlineOffset: 3,
                    }}
                  >
                    Criar grátis →
                  </a>
                </>
              ) : (
                <>
                  Já tem conta?{" "}
                  <a
                    href={`/entrar?tab=entrar${next ? `&next=${encodeURIComponent(next)}` : ""}`}
                    style={{
                      color: "#0a0a0a",
                      fontWeight: 500,
                      textDecoration: "underline",
                      textUnderlineOffset: 3,
                    }}
                  >
                    Entrar
                  </a>
                </>
              )}
            </p>
          </div>
        </div>

        <style>{`
          .entrar-google-btn:hover { background: #f5f4ee !important; }
          @media (max-width: 760px) {
            .entrar-grid { grid-template-columns: 1fr !important; }
            .entrar-left { min-height: auto !important; padding: 52px 24px 20px !important; }
            .entrar-right { min-height: auto !important; padding: 24px 24px 32px !important; }
            .entrar-receipt { display: none !important; }
            .entrar-footer { display: none !important; }
            .entrar-desc { display: none !important; }
            .entrar-badge { display: none !important; }
            .entrar-body { padding-left: 0 !important; justify-content: flex-start !important; }
            .entrar-h1 { margin: 0 !important; font-size: 38px !important; }
            .entrar-form-title { font-size: 22px !important; }
          }
        `}</style>
      </main>
    </PageShell>
  );
}
