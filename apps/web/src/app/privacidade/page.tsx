import type { Metadata } from "next";
import Link from "next/link";

import { Logo } from "@/components/logo";
import { getAbsoluteUrl } from "@/lib/site";

export const metadata: Metadata = {
  title: "Politica de Privacidade | EarlyCV",
  description:
    "Entenda como o EarlyCV coleta, utiliza, compartilha e protege dados pessoais para operar o servico de analise e adaptacao de curriculo.",
  alternates: {
    canonical: getAbsoluteUrl("/privacidade"),
  },
  openGraph: {
    url: getAbsoluteUrl("/privacidade"),
    title: "Politica de Privacidade | EarlyCV",
    description:
      "Regras de tratamento de dados pessoais no EarlyCV, incluindo finalidades, bases legais, compartilhamento e direitos do titular.",
  },
  twitter: {
    title: "Politica de Privacidade | EarlyCV",
    description:
      "Regras de tratamento de dados pessoais no EarlyCV, incluindo finalidades, bases legais, compartilhamento e direitos do titular.",
  },
  robots: {
    index: true,
    follow: true,
  },
};

const GEIST = "var(--font-geist), -apple-system, system-ui, sans-serif";
const MONO = "var(--font-geist-mono), monospace";

export default function PrivacyPage() {
  return (
    <div
      style={{
        fontFamily: GEIST,
        minHeight: "100dvh",
        background:
          "radial-gradient(ellipse 80% 40% at 50% 0%, #f9f8f4 0%, #ecebe5 100%)",
        color: "#0a0a0a",
        position: "relative",
      }}
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
          zIndex: 0,
          backgroundImage: `url("data:image/svg+xml;utf8,<svg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.03 0'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>")`,
        }}
      />

      {/* Nav */}
      <nav
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "20px 40px",
          position: "relative",
          zIndex: 2,
          borderBottom: "1px solid rgba(0,0,0,0.04)",
        }}
      >
        <Logo />
        <Link
          href="/"
          style={{
            fontFamily: MONO,
            fontSize: 13,
            color: "#6a6560",
            textDecoration: "none",
            letterSpacing: 0.2,
          }}
        >
          ← Voltar para home
        </Link>
      </nav>

      {/* Content */}
      <div
        style={{
          maxWidth: 760,
          margin: "0 auto",
          padding: "60px 40px 80px",
          position: "relative",
          zIndex: 2,
        }}
      >
        {/* Kicker */}
        <div style={{ marginBottom: 16 }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              fontFamily: MONO,
              fontSize: 10.5,
              letterSpacing: 1.2,
              fontWeight: 500,
              color: "#555",
              background: "rgba(10,10,10,0.04)",
              border: "1px solid rgba(10,10,10,0.06)",
              padding: "6px 10px",
              borderRadius: 999,
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: "#c6ff3a",
                boxShadow: "0 0 6px #c6ff3a",
                flexShrink: 0,
              }}
            />
            PRIVACIDADE
          </div>
        </div>

        <h1
          style={{
            fontSize: 46,
            fontWeight: 500,
            letterSpacing: -1.8,
            lineHeight: 1.05,
            margin: "16px 0 10px",
          }}
        >
          Política de Privacidade
        </h1>

        <p
          style={{
            fontFamily: MONO,
            fontSize: 11,
            color: "#8a8a85",
            letterSpacing: 0.3,
            marginBottom: 24,
          }}
        >
          Última atualização: 14/04/2026
        </p>

        <p
          style={{
            fontSize: 15.5,
            lineHeight: 1.65,
            color: "#3a3a38",
            margin: "0 0 28px",
          }}
        >
          Esta Política de Privacidade descreve como o EarlyCV trata dados
          pessoais no contexto do fornecimento de serviços de análise de vagas,
          adaptação de currículo e funcionalidades relacionadas. Ao usar a
          plataforma, você declara ciência e concordância com os termos abaixo.
        </p>

        {/* Highlight block */}
        <div
          style={{
            background: "#fafaf6",
            border: "1px solid rgba(10,10,10,0.08)",
            borderLeft: "3px solid #0a0a0a",
            borderRadius: "0 10px 10px 0",
            padding: "20px 24px",
            marginBottom: 36,
          }}
        >
          <p
            style={{
              fontSize: 14.5,
              fontWeight: 600,
              marginBottom: 10,
              letterSpacing: -0.2,
            }}
          >
            Consentimento e aceite
          </p>
          <p style={{ fontSize: 13.5, lineHeight: 1.65, color: "#3a3a38" }}>
            Ao criar conta, enviar currículo, colar descrição de vaga, integrar
            login social ou continuar navegando em funcionalidades autenticadas,
            você consente com o tratamento de dados pessoais nos limites desta
            política, da legislação aplicável (incluindo LGPD) e dos Termos de
            Uso do EarlyCV.
          </p>
        </div>

        {/* Section 1 */}
        <div style={{ marginBottom: 32 }}>
          <h2
            style={{
              fontSize: 22,
              fontWeight: 500,
              letterSpacing: -0.8,
              margin: "0 0 12px",
              lineHeight: 1.2,
            }}
          >
            1. Dados coletados
          </h2>
          <ul style={{ margin: "0 0 8px", paddingLeft: 18 }}>
            {[
              "Dados de cadastro e autenticação (nome, email, identificadores de sessão e tokens).",
              "Dados de perfil profissional informados por você (headline, localidade e informações correlatas).",
              "Dados de currículo e histórico de adaptações (arquivos, texto extraído, metadados e resultados).",
              "Dados de uso e telemetria técnica (logs, IP, dispositivo, datas e horários de acesso).",
              "Dados de pagamento e compra de planos, observadas as informações efetivamente disponibilizadas pelos provedores de pagamento.",
            ].map((item) => (
              <li
                key={item}
                style={{
                  fontSize: 14,
                  lineHeight: 1.7,
                  color: "#3a3a38",
                  marginBottom: 6,
                }}
              >
                {item}
              </li>
            ))}
          </ul>
        </div>

        {/* Section 2 */}
        <div style={{ marginBottom: 32 }}>
          <h2
            style={{
              fontSize: 22,
              fontWeight: 500,
              letterSpacing: -0.8,
              margin: "0 0 12px",
              lineHeight: 1.2,
            }}
          >
            2. Finalidades e bases legais
          </h2>
          <p style={{ fontSize: 14, lineHeight: 1.7, color: "#3a3a38" }}>
            O EarlyCV trata dados para: (a) executar o contrato e prestar o
            serviço solicitado; (b) autenticar contas e proteger o ambiente; (c)
            operar crédito, limite diário e recursos de assinatura; (d) cumprir
            obrigações legais e regulatórias; (e) prevenir fraude, abuso e uso
            indevido; e (f) aprimorar segurança, estabilidade e qualidade do
            serviço, com base em interesse legítimo quando cabível.
          </p>
        </div>

        {/* Section 3 */}
        <div style={{ marginBottom: 32 }}>
          <h2
            style={{
              fontSize: 22,
              fontWeight: 500,
              letterSpacing: -0.8,
              margin: "0 0 12px",
              lineHeight: 1.2,
            }}
          >
            3. Compartilhamento de dados
          </h2>
          <p style={{ fontSize: 14, lineHeight: 1.7, color: "#3a3a38" }}>
            Dados podem ser compartilhados com operadores e subprocessadores
            necessários para hospedagem, autenticação, armazenamento,
            processamento de IA, monitoramento, pagamentos e comunicações
            transacionais, sempre no limite necessário para execução
            operacional. O EarlyCV também pode compartilhar dados mediante
            obrigação legal, ordem judicial ou para exercício regular de
            direitos em processos administrativos, arbitrais ou judiciais.
          </p>
        </div>

        {/* Section 4 */}
        <div style={{ marginBottom: 32 }}>
          <h2
            style={{
              fontSize: 22,
              fontWeight: 500,
              letterSpacing: -0.8,
              margin: "0 0 12px",
              lineHeight: 1.2,
            }}
          >
            4. Uso de IA e dados profissionais
          </h2>
          <p style={{ fontSize: 14, lineHeight: 1.7, color: "#3a3a38" }}>
            Ao submeter currículo e descrição de vaga, você autoriza o
            tratamento dessas informações para gerar análises e sugestões de
            adaptação. Você declara ter legitimidade para enviar os dados e
            assume responsabilidade pelo conteúdo submetido. O EarlyCV não
            garante entrevista, contratação, aprovação em processos seletivos ou
            qualquer resultado profissional específico.
          </p>
        </div>

        {/* Section 5 */}
        <div style={{ marginBottom: 32 }}>
          <h2
            style={{
              fontSize: 22,
              fontWeight: 500,
              letterSpacing: -0.8,
              margin: "0 0 12px",
              lineHeight: 1.2,
            }}
          >
            5. Retenção, segurança e transferência
          </h2>
          <p style={{ fontSize: 14, lineHeight: 1.7, color: "#3a3a38" }}>
            Dados são armazenados pelo período necessário para as finalidades
            descritas, cumprimento de obrigações legais e defesa de direitos. O
            EarlyCV adota medidas técnicas e administrativas razoáveis de
            segurança, sem garantia absoluta contra incidentes. Dependendo da
            infraestrutura de fornecedores, pode haver transferência
            internacional de dados, com salvaguardas contratuais e controles
            compatíveis.
          </p>
        </div>

        {/* Section 6 */}
        <div style={{ marginBottom: 32 }}>
          <h2
            style={{
              fontSize: 22,
              fontWeight: 500,
              letterSpacing: -0.8,
              margin: "0 0 12px",
              lineHeight: 1.2,
            }}
          >
            6. Direitos do titular
          </h2>
          <p style={{ fontSize: 14, lineHeight: 1.7, color: "#3a3a38" }}>
            Nos termos da LGPD, você pode solicitar confirmação de tratamento,
            acesso, correção, anonimização quando aplicável, portabilidade,
            eliminação de dados tratados por consentimento e informações sobre
            compartilhamento. Para exercício desses direitos, contate:{" "}
            <span style={{ fontWeight: 500 }}>privacidade@earlycv.app</span>.
          </p>
        </div>

        {/* Section 7 */}
        <div style={{ marginBottom: 32 }}>
          <h2
            style={{
              fontSize: 22,
              fontWeight: 500,
              letterSpacing: -0.8,
              margin: "0 0 12px",
              lineHeight: 1.2,
            }}
          >
            7. Atualizações desta política
          </h2>
          <p style={{ fontSize: 14, lineHeight: 1.7, color: "#3a3a38" }}>
            Esta política pode ser alterada a qualquer tempo para refletir
            evoluções legais, técnicas e de produto. A versão vigente será
            sempre publicada nesta rota, com indicação da data de atualização.
          </p>
        </div>

        {/* Footer doc */}
        <div
          style={{
            marginTop: 60,
            paddingTop: 20,
            borderTop: "1px solid rgba(10,10,10,0.08)",
          }}
        >
          <p
            style={{
              fontFamily: MONO,
              fontSize: 11,
              color: "#8a8a85",
              letterSpacing: 0.3,
            }}
          >
            earlyCV · 2026 · São Paulo, SP
          </p>
        </div>
      </div>
    </div>
  );
}
