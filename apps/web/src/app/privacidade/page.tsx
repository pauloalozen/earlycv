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
        <a href="/" style={{ display: "flex", textDecoration: "none" }}>
          <Logo />
        </a>
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
            Bases legais do tratamento
          </p>
          <p style={{ fontSize: 13.5, lineHeight: 1.65, color: "#3a3a38" }}>
            O EarlyCV trata dados pessoais conforme a base legal aplicável em
            cada operação: execução de contrato/serviço para conta, análise de
            CV e adaptação; obrigação legal para registros e rotinas financeiras;
            legítimo interesse para segurança, prevenção a fraude e melhoria do
            produto; e consentimento quando aplicável, especialmente para cookies
            não essenciais e comunicações opcionais.
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
          <ul
            style={{
              margin: "0 0 8px",
              paddingLeft: 0,
              listStylePosition: "inside",
            }}
          >
            {[
              "Cadastro e autenticação: nome, email, credenciais e identificadores de sessão.",
              "Currículo: arquivo enviado, texto extraído, metadados, histórico profissional, formação, links e demais dados que você incluir.",
              "Vaga: descrição colada ou informações de vaga fornecidas por você.",
              "Resultados gerados: análise, pontuação, sugestões e currículo adaptado.",
              "Pagamento: plano, status e identificadores de compra/transação; não armazenamos dados completos de cartão.",
              "Uso e segurança: IP, dispositivo, logs, eventos técnicos, dados de sessão, cookies e tecnologias similares.",
              "Analytics: eventos de navegação e funil de produto, sem envio intencional de conteúdo bruto de CV/vaga para ferramentas de analytics.",
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
            operacional. Entre os principais fornecedores e infraestruturas
            utilizadas, quando aplicável, estão: OpenAI (processamento de IA),
            PostHog (analytics de produto/eventos), Google Analytics/GA4
            (métricas de navegação e aquisição), Mercado Pago (pagamentos),
            Cloudflare (DNS, segurança e Turnstile), Vercel e Railway
            (hospedagem/infraestrutura) e Resend (emails transacionais). O
            EarlyCV também pode compartilhar dados mediante obrigação legal,
            ordem judicial ou para exercício regular de direitos em processos
            administrativos, arbitrais ou judiciais.
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
            Ao submeter currículo e descrição de vaga, essas informações serão
            tratadas para gerar análises e sugestões de adaptação. Você declara
            ter legitimidade para enviar os dados e
            assume responsabilidade pelo conteúdo submetido. O EarlyCV não
            garante entrevista, contratação, aprovação em processos seletivos ou
            qualquer resultado profissional específico. O processamento pode usar
            provedores de IA, incluindo OpenAI, conforme a finalidade do serviço.
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

        {/* Section 5.1 */}
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
            5.1 Cookies e tecnologias similares
          </h2>
          <p style={{ fontSize: 14, lineHeight: 1.7, color: "#3a3a38" }}>
            O EarlyCV utiliza cookies e tecnologias similares para
            autenticação, segurança da sessão e funcionamento essencial da
            plataforma. Também utiliza tecnologias de analytics, como PostHog e
            Google Analytics/GA4, para medir uso e melhorar a experiência.
            Cookies e tecnologias não essenciais serão tratados conforme a base
            legal aplicável e, quando exigido, dependerão de consentimento.
          </p>
        </div>

        {/* Section 5.2 */}
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
            5.2 Retenção e exclusão
          </h2>
          <p style={{ fontSize: 14, lineHeight: 1.7, color: "#3a3a38" }}>
            Dados de conta são mantidos enquanto a conta estiver ativa. CVs,
            análises e adaptações podem ser mantidos enquanto necessários para o
            serviço ou enquanto você optar por manter histórico. Registros de
            compra e pagamento são mantidos pelo prazo necessário para
            obrigações legais e defesa de direitos. Logs técnicos e de segurança
            são mantidos por prazo limitado. Você pode solicitar exclusão quando
            cabível, observadas as retenções obrigatórias.
          </p>
        </div>

        {/* Section 5.3 */}
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
            5.3 Dados sensíveis
          </h2>
          <p style={{ fontSize: 14, lineHeight: 1.7, color: "#3a3a38" }}>
            O EarlyCV não solicita dados sensíveis. Evite enviar documentos,
            endereço completo, dados de saúde, religião, biometria ou dados de
            terceiros. Se essas informações forem enviadas por você, poderão ser
            processadas apenas para execução do serviço solicitado.
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
            eliminação de dados pessoais, quando aplicável nos termos da LGPD,
            e informações sobre
            compartilhamento. Para solicitações LGPD e exercício desses
            direitos, contate:{" "}
            <span style={{ fontWeight: 500 }}>privacidade@earlycv.com.br</span>
            .
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
