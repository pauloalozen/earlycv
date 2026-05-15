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
          pessoais para operar os serviços de análise de vagas, adaptação de
          currículo e funcionalidades relacionadas, em conformidade com a Lei
          Geral de Proteção de Dados Pessoais (LGPD - Lei nº 13.709/2018).
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
            cada operação, especialmente as hipóteses do art. 7º da LGPD:
            execução de contrato (art. 7º, V), obrigação legal/regulatória (art.
            7º, II), legítimo interesse (art. 7º, IX) e consentimento quando
            aplicável (art. 7º, I), sobretudo para tecnologias analíticas
            opcionais.
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
            1. Dados coletados, finalidades e bases legais
          </h2>
          <ul
            style={{
              margin: "0 0 8px",
              paddingLeft: 0,
              listStylePosition: "inside",
            }}
          >
            {[
              "Cadastro e autenticação: exemplo de dados: nome, e-mail, identificadores de conta e sessão; finalidade: login, manutenção da conta e segurança; base legal aplicável: art. 7º, V e art. 7º, IX da LGPD.",
              "Currículo enviado: exemplo de dados: arquivo, texto extraído, histórico profissional, formação e links enviados por você; finalidade: análise e adaptação de currículo; base legal aplicável: art. 7º, V da LGPD.",
              "Descrição da vaga: exemplo de dados: texto da vaga colado ou enviado por você; finalidade: comparação com o currículo e geração de recomendações; base legal aplicável: art. 7º, V da LGPD.",
              "Resultados gerados por IA: exemplo de dados: pontuação, diagnóstico, sugestões e versão adaptada; finalidade: entrega do serviço e histórico; base legal aplicável: art. 7º, V e, em cenários de melhoria operacional, art. 7º, IX da LGPD.",
              "Pagamentos e créditos: exemplo de dados: status de pagamento, pacote/plano e identificadores de transação; finalidade: cobrança, conciliação e prevenção de fraude; base legal aplicável: art. 7º, V, art. 7º, II e art. 7º, IX da LGPD.",
              "Navegação, segurança e analytics: exemplo de dados: IP, user agent, logs técnicos, eventos de navegação e contexto de sessão; finalidade: estabilidade, segurança, prevenção de abuso e melhoria do produto; base legal aplicável: art. 7º, IX e, para tecnologias analíticas opcionais, art. 7º, I da LGPD.",
              "Comunicações de e-mail e suporte: exemplo de dados: mensagens enviadas ao suporte e comunicações transacionais; finalidade: atendimento, operação da conta e comunicações necessárias; base legal aplicável: art. 7º, V e art. 7º, IX da LGPD.",
            ].map((item) => (
              <li
                key={item}
                style={{
                  fontSize: 14,
                  lineHeight: 1.7,
                  color: "#3a3a38",
                  marginBottom: 8,
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
            2. Fornecedores e compartilhamento de dados
          </h2>
          <p style={{ fontSize: 14, lineHeight: 1.7, color: "#3a3a38" }}>
            O EarlyCV compartilha dados no limite necessário para operação do
            serviço com operadores e fornecedores como: OpenAI (processamento de
            IA), PostHog (analytics de produto e session replay), Google
            Analytics/GA4 (métricas de navegação), Mercado Pago (pagamentos),
            Cloudflare (segurança, DNS, Turnstile e armazenamento Cloudflare R2
            para arquivos temporários de currículo), Vercel (hospedagem web),
            Railway (infraestrutura backend), Resend (emails transacionais) e
            Zoho Mail (comunicação corporativa). Também pode haver
            compartilhamento para cumprimento de obrigação legal, ordem judicial
            ou exercício regular de direitos.
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
            3. Uso de IA e Session Replay
          </h2>
          <p style={{ fontSize: 14, lineHeight: 1.7, color: "#3a3a38" }}>
            Ao submeter currículo e descrição de vaga, essas informações podem
            ser processadas com apoio de provedores de IA para gerar análises e
            sugestões de melhoria. Para entender fricções de navegação, erros e
            oportunidades de melhoria de UX/produto, o EarlyCV também pode usar
            recursos de Session Replay (como PostHog). Essas ferramentas são
            configuradas para mascarar dados digitados em campos de formulário,
            mas, como em qualquer tecnologia, monitoramento e ajustes contínuos
            podem ser necessários.
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
            4. Cookies e tecnologias similares
          </h2>
          <p
            style={{
              fontSize: 14,
              lineHeight: 1.7,
              color: "#3a3a38",
              marginBottom: 12,
            }}
          >
            Utilizamos cookies e storages para autenticação, segurança,
            funcionamento da plataforma e analytics. Tecnologias não essenciais
            seguem a base legal aplicável e, quando necessário, dependem de
            consentimento.
          </p>
          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: 13.5,
              }}
            >
              <thead>
                <tr>
                  {[
                    "Cookie / Storage",
                    "Finalidade",
                    "Duração aproximada",
                    "Tipo",
                  ].map((header) => (
                    <th
                      key={header}
                      style={{
                        textAlign: "left",
                        padding: "10px 8px",
                        borderBottom: "1px solid rgba(10,10,10,0.15)",
                        fontWeight: 600,
                      }}
                    >
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  [
                    "earlycv-access-token",
                    "Sessão autenticada",
                    "Conforme configuração do sistema",
                    "Necessário",
                  ],
                  [
                    "earlycv-refresh-token",
                    "Renovação de sessão",
                    "Conforme configuração do sistema",
                    "Necessário",
                  ],
                  [
                    "earlycv-backoffice-session",
                    "Sessão de áreas internas autorizadas",
                    "Conforme configuração do sistema",
                    "Necessário",
                  ],
                  [
                    "post_auth_next",
                    "Redirecionamento pós autenticação social",
                    "Curta duração (minutos)",
                    "Necessário",
                  ],
                  [
                    "Cookie ou storage de preferência de consentimento",
                    "Registro da decisão de consentimento",
                    "Conforme configuração do produto",
                    "Necessário",
                  ],
                  [
                    "_ga e _ga_*",
                    "Medição de tráfego e navegação (GA4)",
                    "Conforme configuração do fornecedor/navegador",
                    "Analítico/Opcional",
                  ],
                  [
                    "Cookies/storage do PostHog",
                    "Analytics de produto e Session Replay",
                    "Conforme configuração do fornecedor/navegador",
                    "Analítico/Opcional",
                  ],
                  [
                    "analytics_first_touch_utm (localStorage)",
                    "Atribuição de origem de primeira visita",
                    "Conforme configuração do produto",
                    "Analítico/Opcional",
                  ],
                  [
                    "sessionStorage/localStorage de jornada e contexto analítico",
                    "Correlação de sessão, rota e funil",
                    "Sessão do navegador ou conforme configuração",
                    "Analítico/Opcional",
                  ],
                ].map((row) => (
                  <tr key={row[0]}>
                    {row.map((cell) => (
                      <td
                        key={`${row[0]}-${cell}`}
                        style={{
                          verticalAlign: "top",
                          padding: "10px 8px",
                          borderBottom: "1px solid rgba(10,10,10,0.08)",
                          lineHeight: 1.45,
                          color: "#3a3a38",
                        }}
                      >
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
            5. Retenção de dados
          </h2>
          <p style={{ fontSize: 14, lineHeight: 1.7, color: "#3a3a38" }}>
            Dados de conta são mantidos enquanto a conta existir ou enquanto
            necessários para prestação do serviço. Currículo, vaga e resultados
            de IA podem ser mantidos para histórico, download e continuidade do
            serviço, ou até solicitação de exclusão, observadas retenções
            obrigatórias. Dados de pagamento seguem prazos legais/fiscais e
            controles antifraude. Logs técnicos e de segurança são mantidos pelo
            tempo necessário para segurança, auditoria e prevenção de abuso.
            Dados analíticos seguem consentimento aplicável e configuração dos
            fornecedores.
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
            6. Segurança e transferência internacional
          </h2>
          <p style={{ fontSize: 14, lineHeight: 1.7, color: "#3a3a38" }}>
            O EarlyCV adota medidas de segurança compatíveis com o risco, como
            uso de HTTPS, controles de acesso, autenticação, sanitização de logs
            e analytics, restrição de dados sensíveis em eventos e mecanismos de
            prevenção de abuso. Também utilizamos fornecedores com controles
            próprios de segurança. Dependendo da infraestrutura e da localização
            de fornecedores, pode haver transferência internacional de dados com
            salvaguardas contratuais e operacionais compatíveis.
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
            7. Direitos do titular (art. 18 da LGPD)
          </h2>
          <p style={{ fontSize: 14, lineHeight: 1.7, color: "#3a3a38" }}>
            Nos termos do art. 18 da LGPD, você pode solicitar confirmação de
            tratamento, acesso, correção, anonimização/bloqueio/eliminação
            quando aplicável, portabilidade, informação sobre compartilhamento,
            informação sobre consentimento e revogação do consentimento quando
            essa for a base legal. Para solicitações de privacidade, contate:
            <span style={{ fontWeight: 500 }}> privacidade@earlycv.com.br</span>
            .
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
            8. Uso responsável e limites do serviço
          </h2>
          <p style={{ fontSize: 14, lineHeight: 1.7, color: "#3a3a38" }}>
            O EarlyCV não garante entrevista, contratação, aprovação em vaga ou
            qualquer resultado profissional específico. Recomendamos que você
            envie apenas dados necessários para análise do currículo e da vaga,
            evitando inserir informações de terceiros ou dados excessivos.
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
            9. Atualizações desta política
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
