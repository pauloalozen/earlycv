import type { Metadata } from "next";
import { PageShell } from "@/components/page-shell";
import { CopyEmail } from "./copy-email";

const GEIST = "var(--font-geist), -apple-system, system-ui, sans-serif";
const MONO = "var(--font-geist-mono), monospace";

export const metadata: Metadata = {
  title: "Contato | EarlyCV",
  description:
    "Entre em contato com a equipe EarlyCV para dúvidas, problemas ou sugestões.",
  robots: { index: false, follow: false },
};

export default function ContatoPage() {
  return (
    <PageShell>
      <main
        style={{
          fontFamily: GEIST,
          background:
            "radial-gradient(ellipse 80% 60% at 50% 0%, #f9f8f4 0%, #ecebe5 100%)",
          minHeight: "100dvh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "40px 20px",
          color: "#0a0a0a",
        }}
      >
        {/* Logo */}
        <a
          href="/"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            textDecoration: "none",
            marginBottom: 48,
          }}
        >
          {/* biome-ignore lint/performance/noImgElement: logo estático */}
          <img
            src="/logo.svg"
            alt="earlyCV"
            style={{ height: 36, width: "auto", display: "block" }}
          />
          <span
            style={{
              fontFamily: MONO,
              fontSize: 10,
              color: "#8a8a85",
              border: "1px solid #d8d6ce",
              borderRadius: 3,
              padding: "1px 5px",
              fontWeight: 500,
            }}
          >
            v1.2
          </span>
        </a>

        {/* Card */}
        <div
          style={{
            width: "100%",
            maxWidth: 480,
            background: "#fafaf6",
            border: "1px solid rgba(10,10,10,0.08)",
            borderRadius: 18,
            padding: "40px 36px",
            boxShadow: "0 8px 40px -12px rgba(10,10,10,0.12)",
          }}
        >
          {/* Kicker */}
          <p
            style={{
              fontFamily: MONO,
              fontSize: 10,
              letterSpacing: 1.2,
              color: "#8a8a85",
              marginBottom: 12,
              textTransform: "uppercase",
            }}
          >
            Fale conosco
          </p>

          <h1
            style={{
              fontSize: 26,
              fontWeight: 500,
              letterSpacing: -0.8,
              color: "#0a0a0a",
              margin: "0 0 16px",
              lineHeight: 1.15,
            }}
          >
            Tem alguma dúvida ou sugestão?
          </h1>

          <p
            style={{
              fontSize: 15,
              color: "#6a6560",
              lineHeight: 1.65,
              margin: "0 0 28px",
            }}
          >
            Encontrou algum problema, quer compartilhar uma ideia ou só tem uma
            dúvida? A equipe do EarlyCV lê todas as mensagens e responde o mais
            rápido possível.
          </p>

          {/* Email com botão de copiar */}
          <CopyEmail />

          {/* Back link */}
          <div style={{ marginTop: 24, textAlign: "center" }}>
            <a
              href="/"
              style={{
                fontFamily: MONO,
                fontSize: 11.5,
                color: "#8a8a85",
                textDecoration: "none",
                letterSpacing: 0.2,
              }}
            >
              ← Voltar para o início
            </a>
          </div>
        </div>
      </main>
    </PageShell>
  );
}
