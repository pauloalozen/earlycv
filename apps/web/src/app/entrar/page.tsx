import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageShell } from "@/components/page-shell";
import { getRouteAccessRedirectPath } from "@/lib/app-session";
import { getCurrentAppUserFromCookies } from "@/lib/app-session.server";
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
  const googleUrl = `${process.env.NEXT_PUBLIC_API_URL}/api/auth/google/start${next ? `?next=${encodeURIComponent(next)}` : ""}`;

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
            position: "fixed", inset: 0, pointerEvents: "none", opacity: 0.4,
            mixBlendMode: "multiply", zIndex: 1,
            backgroundImage: `url("data:image/svg+xml;utf8,<svg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.03 0'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>")`,
          }}
        />

        {/* ── Painel esquerdo — brand ── */}
        <div
          style={{
            background: "#0a0a0a", color: "#f0efe9",
            padding: "32px 56px",
            display: "flex", flexDirection: "column",
            position: "relative", zIndex: 2,
            minHeight: "100dvh",
          }}
          className="entrar-left"
        >
          {/* Top nav */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <a href="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
              <div style={{ width: 18, height: 18, borderRadius: 5, background: "#fafaf6", boxShadow: "inset -2px -2px 0 #c6ff3a", flexShrink: 0 }} />
              <span style={{ fontSize: 17, fontWeight: 600, letterSpacing: -0.4, color: "#fafaf6" }}>earlyCV</span>
            </a>
            <span style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: 1, color: "#8a8a85" }}>PT · BR</span>
          </div>

          {/* Body */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", maxWidth: 440, paddingLeft: 40 }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8, fontFamily: MONO, fontSize: 10.5, letterSpacing: 1.2, color: "#8a8a85", marginBottom: 22 }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#c6ff3a", boxShadow: "0 0 6px #c6ff3a", display: "inline-block" }} />
              {isLogin ? "ENTRAR" : "CRIAR CONTA"}
            </div>

            <h1 style={{ fontSize: "clamp(40px, 4vw, 64px)", fontWeight: 500, letterSpacing: -2.5, lineHeight: 0.98, color: "#fafaf6", marginBottom: 22, margin: "0 0 22px" }}>
              {isLogin ? (
                <>Bem-vindo<br /><em style={{ fontFamily: SERIF_ITALIC, fontStyle: "italic", fontWeight: 400 }}>de volta.</em></>
              ) : (
                <>Comece<br /><em style={{ fontFamily: SERIF_ITALIC, fontStyle: "italic", fontWeight: 400 }}>agora.</em></>
              )}
            </h1>

            <p style={{ fontSize: 15.5, lineHeight: 1.55, color: "#a8a8a0", marginBottom: 36 }}>
              {isLogin
                ? "Continue de onde parou. Seus CVs e vagas analisadas seguem esperando."
                : "Grátis. Sem cartão. Menos de 1 minuto para criar sua conta e adaptar seu CV."}
            </p>

            {/* Receipt */}
            <div style={{ borderTop: "1px solid rgba(250,250,246,0.12)", paddingTop: 16 }}>
              {[
                { k: "SESSÃO", v: "encrypted · tls 1.3" },
                { k: "DADOS", v: "não usados para treinar IA" },
                { k: "ANÁLISES", v: "12k+ CVs processados" },
              ].map(row => (
                <div key={row.k} style={{ display: "flex", justifyContent: "space-between", fontFamily: MONO, fontSize: 11, padding: "6px 0" }}>
                  <span style={{ color: "#7a7a74", letterSpacing: 0.6 }}>{row.k}</span>
                  <span style={{ color: "#d8d7cf" }}>{row.v}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Footer */}
          <div style={{ display: "flex", justifyContent: "space-between", fontFamily: MONO, fontSize: 10.5, color: "#6a6a64", letterSpacing: 0.3 }}>
            <span>© earlyCV · 2026</span>
            <span>v1.2 · status ● operational</span>
          </div>
        </div>

        {/* ── Painel direito — form ── */}
        <div
          style={{
            background: "#fafaf6",
            display: "flex", alignItems: "center", justifyContent: "center",
            position: "relative", zIndex: 2,
            padding: "40px 32px",
            minHeight: "100dvh",
          }}
          className="entrar-right"
        >
          <div style={{ width: "100%", maxWidth: 380 }}>
            <h2 style={{ fontSize: 28, fontWeight: 500, letterSpacing: -1, marginBottom: 6, color: "#0a0a0a" }}>
              {isLogin ? "Entrar na conta" : "Criar conta grátis"}
            </h2>
            <p style={{ fontSize: 14, color: "#6a6560", marginBottom: 28, lineHeight: 1.5 }}>
              {isLogin ? "Use seu email ou continue com Google." : "Use seu email ou continue com Google."}
            </p>

            {/* Error */}
            {error && (
              <div style={{ marginBottom: 20, padding: "10px 14px", background: "#fee2e2", border: "1px solid #fecaca", borderRadius: 8, fontFamily: MONO, fontSize: 12, color: "#991b1b" }}>
                {error}
              </div>
            )}

            {/* Google — primeiro */}
            <a
              href={googleUrl}
              style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
                width: "100%", background: "#fff", border: "1px solid #d8d6ce",
                borderRadius: 10, padding: "12px", fontSize: 13.5, fontWeight: 500,
                color: "#0a0a0a", textDecoration: "none", marginBottom: 22,
                fontFamily: GEIST,
                boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
              }}
              className="entrar-google-btn"
            >
              {/* biome-ignore lint/a11y/noSvgWithoutTitle: decorative */}
              <svg aria-hidden width="16" height="16" viewBox="0 0 18 18">
                <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"/>
                <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/>
                <path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"/>
                <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"/>
              </svg>
              Continuar com Google
            </a>

            {/* Divider */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 22 }}>
              <div style={{ flex: 1, height: 1, background: "#d8d6ce" }} />
              <span style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: 1.2, color: "#8a8a85", fontWeight: 500 }}>OU COM EMAIL</span>
              <div style={{ flex: 1, height: 1, background: "#d8d6ce" }} />
            </div>

            {/* Form */}
            {isLogin ? <LoginForm next={next} /> : <RegisterForm next={next} />}

            {/* Tab switch */}
            <p style={{ textAlign: "center", fontSize: 13, color: "#6a6560", marginTop: 20 }}>
              {isLogin ? (
                <>Não tem conta?{" "}
                  <a href={`/entrar?tab=cadastro${next ? `&next=${encodeURIComponent(next)}` : ""}`} style={{ color: "#0a0a0a", fontWeight: 500, textDecoration: "underline", textUnderlineOffset: 3 }}>
                    Criar grátis →
                  </a>
                </>
              ) : (
                <>Já tem conta?{" "}
                  <a href={`/entrar?tab=entrar${next ? `&next=${encodeURIComponent(next)}` : ""}`} style={{ color: "#0a0a0a", fontWeight: 500, textDecoration: "underline", textUnderlineOffset: 3 }}>
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
            .entrar-left { min-height: auto !important; padding: 28px 24px !important; }
            .entrar-right { min-height: auto !important; }
          }
        `}</style>
      </main>
    </PageShell>
  );
}
