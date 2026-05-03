// ========== PRIVACIDADE + TERMOS DE USO ==========
// Layout compartilhado: nav centrado, documento com tipografia editorial,
// seções numeradas, bloco de destaque.

function LegalPage({ title, lastUpdated, intro, highlight, sections, backLabel }) {
  const s = legalStyles;
  return (
    <div style={s.page}>
      <div style={s.grain} />
      <div style={s.nav}>
        <div style={s.logoWrap}>
          <div style={s.logoDot} />
          <div style={s.logo}>earlyCV</div>
          <div style={s.logoVer}>v1.2</div>
        </div>
        <div style={s.navRight}>
          <a style={s.navLink}>← Voltar para home</a>
        </div>
      </div>
      <div style={s.wrap}>
        <div style={s.meta}>
          <div style={s.kicker}>
            <span style={s.kickerDot} />
            {backLabel}
          </div>
        </div>
        <h1 style={s.h1}>{title}</h1>
        <div style={s.updated}>
          <span style={s.updatedMono}>Última atualização: {lastUpdated}</span>
        </div>
        <p style={s.intro}>{intro}</p>
        {highlight && (
          <div style={s.highlight}>
            <div style={s.highlightTitle}>{highlight.title}</div>
            <div style={s.highlightBody}>{highlight.body}</div>
          </div>
        )}
        {sections.map((sec, i) => (
          <div key={i} style={s.section}>
            <h2 style={s.h2}>{i + 1}. {sec.title}</h2>
            {sec.body && <p style={s.body}>{sec.body}</p>}
            {sec.items && (
              <ul style={s.list}>
                {sec.items.map((item, j) => (
                  <li key={j} style={s.listItem}>{item}</li>
                ))}
              </ul>
            )}
          </div>
        ))}
        <div style={s.footerDoc}>
          <div style={s.footerDocLine} />
          <div style={s.footerDocText}>earlyCV · 2026 · São Paulo, SP</div>
        </div>
      </div>
    </div>
  );
}

function Privacidade() {
  return (
    <LegalPage
      title="Política de Privacidade"
      lastUpdated="14/04/2026"
      backLabel="PRIVACIDADE"
      intro="Esta Política de Privacidade descreve como o EarlyCV trata dados pessoais no contexto do fornecimento de serviços de análise de vagas, adaptação de currículo e funcionalidades relacionadas. Ao usar a plataforma, você declara ciência e concordância com os termos abaixo."
      highlight={{
        title: 'Consentimento e aceite',
        body: 'Ao criar conta, enviar currículo, colar descrição de vaga, integrar login social ou continuar navegando em funcionalidades autenticadas, você consente com o tratamento de dados pessoais nos limites desta política, da legislação aplicável (incluindo LGPD) e dos Termos de Uso do EarlyCV.',
      }}
      sections={[
        {
          title: 'Dados coletados',
          items: [
            'Dados de cadastro e autenticação (nome, email, identificadores de sessão e tokens).',
            'Dados de perfil profissional informados por você (headline, localidade e informações correlatas).',
            'Dados de currículo e histórico de adaptações (arquivos, texto extraído, metadados e resultados).',
            'Dados de uso e telemetria técnica (logs, IP, dispositivo, datas e horários de acesso).',
            'Dados de pagamento e compra de planos, observadas as informações efetivamente disponibilizadas pelos provedores de pagamento.',
          ],
        },
        {
          title: 'Finalidades e bases legais',
          body: 'O EarlyCV trata dados para: (a) executar o contrato e prestar o serviço solicitado; (b) autenticar contas e proteger o ambiente; (c) operar crédito, limite diário e recursos de assinatura; (d) cumprir obrigações legais e regulatórias; (e) prevenir fraude, abuso e uso indevido; e (f) aprimorar segurança, estabilidade e qualidade do serviço, com base em interesse legítimo quando cabível.',
        },
        {
          title: 'Compartilhamento de dados',
          body: 'Dados podem ser compartilhados com operadores e subprocessadores necessários para hospedagem, autenticação, armazenamento, processamento de IA, monitoramento, pagamentos e comunicações transacionais, sempre no limite necessário para execução operacional. O EarlyCV também pode compartilhar dados mediante obrigação legal, ordem judicial ou para exercício regular de direitos em processos administrativos, arbitrais ou judiciais.',
        },
        {
          title: 'Uso de IA e dados profissionais',
          body: 'Ao submeter currículo e descrição de vaga, você autoriza o tratamento dessas informações para gerar análises e sugestões de adaptação. Você declara ter legitimidade para enviar os dados e assume responsabilidade pelo conteúdo submetido. O EarlyCV não garante entrevista, contratação, aprovação em processos seletivos ou qualquer resultado profissional específico.',
        },
        {
          title: 'Retenção, segurança e transferência',
          body: 'Dados são armazenados pelo período necessário para as finalidades descritas, cumprimento de obrigações legais e defesa de direitos. O EarlyCV adota medidas técnicas e administrativas razoáveis de segurança, sem garantia absoluta contra incidentes. Dependendo da infraestrutura de fornecedores, pode haver transferência internacional de dados, com salvaguardas contratuais e controles compatíveis.',
        },
        {
          title: 'Direitos do titular',
          body: 'Nos termos da LGPD, você pode solicitar confirmação de tratamento, acesso, correção, anonimização quando aplicável, portabilidade, eliminação de dados tratados por consentimento e informações sobre compartilhamento. Para exercício desses direitos, contate: privacidade@earlycv.app.',
        },
        {
          title: 'Atualizações desta política',
          body: 'Esta política pode ser alterada a qualquer tempo para refletir evoluções legais, técnicas e de produto. A versão vigente será sempre publicada nesta rota, com indicação da data de atualização.',
        },
      ]}
    />
  );
}

function TermosDeUso() {
  return (
    <LegalPage
      title="Termos de Uso"
      lastUpdated="14/04/2026"
      backLabel="TERMOS DE USO"
      intro="Estes Termos de Uso regulam o acesso e o uso da plataforma EarlyCV. Ao criar conta, navegar em área autenticada ou utilizar qualquer funcionalidade do serviço, você declara leitura, ciência e aceite integral destes termos."
      highlight={{
        title: 'Natureza do serviço e ausência de garantia de resultado',
        body: 'O EarlyCV fornece ferramenta de apoio informacional para análise de aderência entre currículo e vaga, sem promessa de contratação, entrevista, progresso em processo seletivo ou qualquer resultado profissional. O serviço é prestado no estado em que se encontra ("as is"), dentro dos limites técnicos e operacionais da plataforma.',
      }}
      sections={[
        {
          title: 'Elegibilidade e conta',
          body: 'Você deve possuir capacidade legal para contratar e se compromete a manter dados de cadastro corretos e atualizados. Credenciais de acesso são pessoais, intransferíveis e de sua responsabilidade exclusiva. O EarlyCV pode suspender ou encerrar contas em caso de fraude, violação destes termos, risco de segurança ou exigência legal.',
        },
        {
          title: 'Regras de uso e condutas vedadas',
          items: [
            'Usar o serviço para fins ilícitos, discriminatórios, difamatórios ou em violação a direitos de terceiros.',
            'Enviar dados sem base legal, consentimento ou legitimidade para tratamento.',
            'Tentar contornar limites técnicos, créditos, autenticação, segurança ou controles antiabuso.',
            'Realizar engenharia reversa, scraping não autorizado, automação abusiva ou interferência na infraestrutura.',
          ],
        },
        {
          title: 'Conteúdo do usuário e licença de uso',
          body: 'Você permanece titular do conteúdo enviado, mas concede ao EarlyCV licença não exclusiva para processar, armazenar, transformar e exibir os dados estritamente para operação da plataforma, prevenção de abuso, auditoria, suporte e melhoria do serviço. Você declara que o conteúdo submetido não infringe direitos de terceiros.',
        },
        {
          title: 'Planos, créditos e pagamentos',
          body: 'Planos, créditos, limites diários e condições comerciais podem variar conforme oferta vigente. O acesso a funcionalidades pagas depende de confirmação de pagamento e cumprimento das regras da plataforma. Estornos, cancelamentos e disputas obedecem à legislação aplicável, aos termos de pagamento e às políticas específicas divulgadas no fluxo de compra.',
        },
        {
          title: 'Limitação de responsabilidade',
          body: 'Na máxima extensão permitida por lei, o EarlyCV, seus sócios, administradores, empregados e fornecedores não respondem por danos indiretos, lucros cessantes, perda de chance, danos reputacionais, indisponibilidade temporária, falhas de terceiros, ou por decisões de recrutadores e empresas contratantes. A responsabilidade total do EarlyCV, quando aplicável, fica limitada ao montante efetivamente pago pelo usuário nos 12 meses anteriores ao evento que deu causa à reclamação.',
        },
        {
          title: 'Indenização',
          body: 'Você concorda em indenizar e manter o EarlyCV indene de perdas, custos, danos, responsabilidades e despesas decorrentes de uso ilícito da plataforma, violação destes termos, violação de direitos de terceiros ou submissão de dados sem legitimidade.',
        },
        {
          title: 'Privacidade e proteção de dados',
          body: 'O tratamento de dados pessoais segue a Política de Privacidade, disponível em /privacidade. Ao utilizar o serviço, você reconhece que o tratamento de dados é necessário para execução do contrato e operação legítima da plataforma.',
        },
        {
          title: 'Foro, legislação e alterações',
          body: 'Estes termos são regidos pelas leis da República Federativa do Brasil. Fica eleito o foro da comarca de São Paulo/SP, com renúncia a qualquer outro, salvo disposição legal imperativa diversa. O EarlyCV pode alterar estes termos a qualquer tempo, mediante publicação da versão vigente nesta rota.',
        },
      ]}
    />
  );
}

const legalStyles = {
  page: {
    width: 1440, minHeight: 1200,
    background: 'radial-gradient(ellipse 80% 40% at 50% 0%, #f9f8f4 0%, #ecebe5 100%)',
    fontFamily: '"Geist", sans-serif', color: '#0a0a0a', position: 'relative',
  },
  grain: {
    position: 'absolute', inset: 0, pointerEvents: 'none', opacity: 0.4,
    backgroundImage: `url("data:image/svg+xml;utf8,<svg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.03 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>")`,
    mixBlendMode: 'multiply',
  },
  nav: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '20px 40px', position: 'relative', zIndex: 2,
    borderBottom: '1px solid rgba(0,0,0,0.04)',
  },
  logoWrap: { display: 'flex', alignItems: 'center', gap: 10 },
  logoDot: { width: 18, height: 18, borderRadius: 5, background: '#0a0a0a', boxShadow: 'inset -2px -2px 0 rgba(198,255,58,0.85)' },
  logo: { fontSize: 17, fontWeight: 600, letterSpacing: -0.4 },
  logoVer: { fontFamily: '"Geist Mono", monospace', fontSize: 10, color: '#8a8a85', border: '1px solid #d8d6ce', borderRadius: 3, padding: '1px 5px', fontWeight: 500 },
  navRight: {},
  navLink: { fontSize: 13, color: '#6a6560', cursor: 'pointer', textDecoration: 'none', fontFamily: '"Geist Mono", monospace', letterSpacing: 0.2 },
  wrap: { maxWidth: 760, margin: '0 auto', padding: '60px 40px 80px', position: 'relative', zIndex: 2 },
  meta: { marginBottom: 16 },
  kicker: {
    display: 'inline-flex', alignItems: 'center', gap: 8,
    fontFamily: '"Geist Mono", monospace', fontSize: 10.5, letterSpacing: 1.2,
    fontWeight: 500, color: '#555',
    background: 'rgba(10,10,10,0.04)', border: '1px solid rgba(10,10,10,0.06)',
    padding: '6px 10px', borderRadius: 999,
  },
  kickerDot: { width: 6, height: 6, borderRadius: '50%', background: '#c6ff3a', boxShadow: '0 0 6px #c6ff3a' },
  h1: { fontSize: 46, fontWeight: 500, letterSpacing: -1.8, lineHeight: 1.05, margin: '16px 0 10px' },
  updated: { marginBottom: 24 },
  updatedMono: { fontFamily: '"Geist Mono", monospace', fontSize: 11, color: '#8a8a85', letterSpacing: 0.3 },
  intro: { fontSize: 15.5, lineHeight: 1.65, color: '#3a3a38', margin: '0 0 28px' },
  highlight: {
    background: '#fafaf6', border: '1px solid rgba(10,10,10,0.08)',
    borderLeft: '3px solid #0a0a0a',
    borderRadius: '0 10px 10px 0',
    padding: '20px 24px', marginBottom: 36,
  },
  highlightTitle: { fontSize: 14.5, fontWeight: 600, marginBottom: 10, letterSpacing: -0.2 },
  highlightBody: { fontSize: 13.5, lineHeight: 1.65, color: '#3a3a38' },
  section: { marginBottom: 32 },
  h2: { fontSize: 22, fontWeight: 500, letterSpacing: -0.8, margin: '0 0 12px', lineHeight: 1.2 },
  body: { fontSize: 14, lineHeight: 1.7, color: '#3a3a38', margin: '0 0 10px' },
  list: { margin: '0 0 8px', paddingLeft: 18 },
  listItem: { fontSize: 14, lineHeight: 1.7, color: '#3a3a38', marginBottom: 6 },
  footerDoc: { marginTop: 60, paddingTop: 20, borderTop: '1px solid rgba(10,10,10,0.08)' },
  footerDocLine: {},
  footerDocText: { fontFamily: '"Geist Mono", monospace', fontSize: 11, color: '#8a8a85', letterSpacing: 0.3 },
};

window.Privacidade = Privacidade;
window.TermosDeUso = TermosDeUso;
