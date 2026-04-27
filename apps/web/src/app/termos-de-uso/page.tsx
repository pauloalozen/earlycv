import type { Metadata } from "next";
import Link from "next/link";

import { Logo } from "@/components/logo";
import { getAbsoluteUrl } from "@/lib/site";

export const metadata: Metadata = {
  title: "Termos de Uso | EarlyCV",
  description:
    "Condicoes de uso do EarlyCV, incluindo regras de acesso, responsabilidades do usuario, limitacao de responsabilidade e disposicoes legais.",
  alternates: {
    canonical: getAbsoluteUrl("/termos-de-uso"),
  },
  openGraph: {
    url: getAbsoluteUrl("/termos-de-uso"),
    title: "Termos de Uso | EarlyCV",
    description:
      "Regras juridicas de utilizacao da plataforma EarlyCV e condicoes para uso dos servicos.",
  },
  twitter: {
    title: "Termos de Uso | EarlyCV",
    description:
      "Regras juridicas de utilizacao da plataforma EarlyCV e condicoes para uso dos servicos.",
  },
  robots: {
    index: true,
    follow: true,
  },
};

const GEIST = "var(--font-geist), -apple-system, system-ui, sans-serif";
const MONO = "var(--font-geist-mono), monospace";

export default function TermsPage() {
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
            TERMOS DE USO
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
          Termos de Uso
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
          Estes Termos de Uso regulam o acesso e o uso da plataforma EarlyCV. Ao
          criar conta, navegar em área autenticada ou utilizar qualquer
          funcionalidade do serviço, você declara leitura, ciência e aceite
          integral destes termos.
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
            Natureza do serviço e ausência de garantia de resultado
          </p>
          <p style={{ fontSize: 13.5, lineHeight: 1.65, color: "#3a3a38" }}>
            O EarlyCV fornece ferramenta de apoio informacional para análise de
            aderência entre currículo e vaga, sem promessa de contratação,
            entrevista, progresso em processo seletivo ou qualquer resultado
            profissional. O serviço é prestado no estado em que se encontra
            (&ldquo;as is&rdquo;), dentro dos limites técnicos e operacionais da
            plataforma.
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
            1. Elegibilidade e conta
          </h2>
          <p style={{ fontSize: 14, lineHeight: 1.7, color: "#3a3a38" }}>
            Você deve possuir capacidade legal para contratar e se compromete a
            manter dados de cadastro corretos e atualizados. Credenciais de
            acesso são pessoais, intransferíveis e de sua responsabilidade
            exclusiva. O EarlyCV pode suspender ou encerrar contas em caso de
            fraude, violação destes termos, risco de segurança ou exigência
            legal.
          </p>
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
            2. Regras de uso e condutas vedadas
          </h2>
          <ul style={{ margin: "0 0 8px", paddingLeft: 18 }}>
            {[
              "Usar o serviço para fins ilícitos, discriminatórios, difamatórios ou em violação a direitos de terceiros.",
              "Enviar dados sem base legal, consentimento ou legitimidade para tratamento.",
              "Tentar contornar limites técnicos, créditos, autenticação, segurança ou controles antiabuso.",
              "Realizar engenharia reversa, scraping não autorizado, automação abusiva ou interferência na infraestrutura.",
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
            3. Conteúdo do usuário e licença de uso
          </h2>
          <p style={{ fontSize: 14, lineHeight: 1.7, color: "#3a3a38" }}>
            Você permanece titular do conteúdo enviado, mas concede ao EarlyCV
            licença não exclusiva para processar, armazenar, transformar e
            exibir os dados estritamente para operação da plataforma, prevenção
            de abuso, auditoria, suporte e melhoria do serviço. Você declara que
            o conteúdo submetido não infringe direitos de terceiros.
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
            4. Planos, créditos e pagamentos
          </h2>
          <p style={{ fontSize: 14, lineHeight: 1.7, color: "#3a3a38" }}>
            Planos, créditos, limites diários e condições comerciais podem
            variar conforme oferta vigente. O acesso a funcionalidades pagas
            depende de confirmação de pagamento e cumprimento das regras da
            plataforma. Estornos, cancelamentos e disputas obedecem à legislação
            aplicável, aos termos de pagamento e às políticas específicas
            divulgadas no fluxo de compra.
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
            5. Limitação de responsabilidade
          </h2>
          <p style={{ fontSize: 14, lineHeight: 1.7, color: "#3a3a38" }}>
            Na máxima extensão permitida por lei, o EarlyCV, seus sócios,
            administradores, empregados e fornecedores não respondem por danos
            indiretos, lucros cessantes, perda de chance, danos reputacionais,
            indisponibilidade temporária, falhas de terceiros, ou por decisões
            de recrutadores e empresas contratantes. A responsabilidade total do
            EarlyCV, quando aplicável, fica limitada ao montante efetivamente
            pago pelo usuário nos 12 meses anteriores ao evento que deu causa à
            reclamação.
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
            6. Indenização
          </h2>
          <p style={{ fontSize: 14, lineHeight: 1.7, color: "#3a3a38" }}>
            Você concorda em indenizar e manter o EarlyCV indene de perdas,
            custos, danos, responsabilidades e despesas decorrentes de uso
            ilícito da plataforma, violação destes termos, violação de direitos
            de terceiros ou submissão de dados sem legitimidade.
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
            7. Privacidade e proteção de dados
          </h2>
          <p style={{ fontSize: 14, lineHeight: 1.7, color: "#3a3a38" }}>
            O tratamento de dados pessoais segue a Política de Privacidade,
            disponível em{" "}
            <Link
              href="/privacidade"
              style={{ color: "#0a0a0a", fontWeight: 500 }}
            >
              /privacidade
            </Link>
            . Ao utilizar o serviço, você reconhece que o tratamento de dados é
            necessário para execução do contrato e operação legítima da
            plataforma.
          </p>
        </div>

        {/* Section 8 */}
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
            8. Foro, legislação e alterações
          </h2>
          <p style={{ fontSize: 14, lineHeight: 1.7, color: "#3a3a38" }}>
            Estes termos são regidos pelas leis da República Federativa do
            Brasil. Fica eleito o foro da comarca de São Paulo/SP, com renúncia
            a qualquer outro, salvo disposição legal imperativa diversa. O
            EarlyCV pode alterar estes termos a qualquer tempo, mediante
            publicação da versão vigente nesta rota.
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
