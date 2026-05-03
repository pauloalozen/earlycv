// ========== PALAVRAS-CHAVE (artigo longo) ==========
function PalavrasChave() {
  const s = kwStyles;

  return (
    <div style={s.page}>
      <Grain />
      <NavBar />
      <div style={s.wrap}>

        {/* Header */}
        <div style={s.kicker}>CURRÍCULO</div>
        <h1 style={s.h1}>Palavras-chave para currículo: lista por área, cargo e senioridade</h1>
        <div style={s.meta}>
          <span style={s.metaMono}>2026-05-01</span>
          <span style={s.metaDot}>·</span>
          <span style={s.metaMono}>12 min</span>
        </div>
        <p style={s.lead}>Guia completo sobre como encontrar as palavras certas para o seu currículo se destacar nos filtros ATS e chamar atenção de recrutadores.</p>

        {/* CTA inline */}
        <CtaBlock title="Descubra as palavras do seu currículo com uma vaga" sub="Analise gratuitamente a aderência do seu currículo a uma vaga específica." />

        <p style={s.p}>As palavras-chave são a ponte entre o que você fez e o que o sistema ATS procura. Sem elas no lugar certo, seu CV é invisível — mesmo que sua experiência seja exatamente o que a empresa precisa.</p>

        <KwSection title="O que são palavras-chave no currículo">
          <p style={s.p}>São termos técnicos, competências, ferramentas e verbos de ação que recrutadores e sistemas de triagem automática (ATS) usam para filtrar candidatos. Quanto mais alinhadas ao anúncio, maior a chance de passar para a próxima etapa.</p>
        </KwSection>

        <KwSection title="Como usar palavras-chave com maestria">
          <ul style={s.list}>
            <li style={s.li}>Use os termos exatos quando forem verdadeiros no seu contexto</li>
            <li style={s.li}>Posicione nas seções de experiência, habilidades e resumo</li>
            <li style={s.li}>Evite listas soltas sem contexto — incorpore em bullets com resultado</li>
            <li style={s.li}>Atualize a cada candidatura com base no anúncio específico</li>
          </ul>
        </KwSection>

        <KwSection title="Onde colocar palavras-chave">
          <ul style={s.list}>
            <li style={s.li}>Resumo profissional</li>
            <li style={s.li}>Tecnologias</li>
            <li style={s.li}>Habilidades técnicas</li>
            <li style={s.li}>Experiências</li>
            <li style={s.li}>Formação</li>
          </ul>
        </KwSection>

        <KwSection title="Liste com cuidado">
          <ul style={s.list}>
            {['Analista de Dados Júnior / Pleno', 'Analista de Dados Sênior', 'Data Scientist / Cientista de Dados', 'Engenheiro de Dados / Data Engineer', 'Data Analyst (SaaS / Produto)', 'Head de Dados / Analytics Manager'].map((c, i) => (
              <li key={i} style={s.li}>{c}</li>
            ))}
          </ul>
        </KwSection>

        <KwSection title="Lista por cargo">
          <p style={s.p}>A lista de palavras-chave varia muito de acordo com o cargo, área e senioridade. Selecione os termos mais relevantes para o seu contexto — não é necessário usar todos.</p>
        </KwSection>

        <KwSection title="Confira as áreas">
          <div style={s.areaTags}>
            {['Gestão', 'Financeiro', 'Marketing', 'Vendas', 'Operações', 'Jurídico', 'RH', 'TI / Tech', 'Dados', 'Produto'].map(a => (
              <span key={a} style={s.areaTag}>{a}</span>
            ))}
          </div>
        </KwSection>

        <KwSection title="Tecnologia">
          <div style={s.techKicker}>NÍVEL PLENO / SÊNIOR</div>

          {[
            { role: 'Analista de Dados', items: ['SQL', 'Python', 'Tableau', 'Power BI', 'Excel avançado', 'ETL', 'Google Analytics', 'Data Studio', 'BigQuery', 'análise exploratória'] },
            { role: 'Engenheiro de Dados', items: ['Python', 'SQL', 'Spark', 'Airflow', 'dbt', 'Kafka', 'cloud (AWS/GCP/Azure)', 'pipelines de dados', 'data lake', 'modelagem dimensional'] },
            { role: 'Desenvolvedor Backend', items: ['Node.js', 'Python', 'Java', 'REST APIs', 'GraphQL', 'Docker', 'CI/CD', 'PostgreSQL', 'Redis', 'AWS'] },
            { role: 'Product Manager', items: ['roadmap', 'OKR', 'discovery', 'priorização', 'Jira', 'métricas de produto', 'entrevistas de usuário', 'AB test', 'go-to-market', 'stakeholder management'] },
          ].map((r, i) => (
            <div key={i} style={s.roleBlock}>
              <div style={s.roleTitle}>{r.role}</div>
              <div style={s.tagGrid}>
                {r.items.map(t => (
                  <span key={t} style={s.kwTag}>{t}</span>
                ))}
              </div>
            </div>
          ))}
        </KwSection>

        <CtaBlock title="Quer saber quais palavras faltam no seu currículo?" sub="Analise gratuitamente e veja quais termos da vaga estão ausentes no seu CV." />

        {/* FAQ */}
        <div style={s.faqTitle}>FAQ</div>
        {[
          { q: 'Quantas palavras-chave devo usar no currículo?', a: 'Não existe um número fixo. O mais importante é que os termos apareçam de forma natural e contextualizada. Em geral, CVs bem otimizados têm entre 10 e 20 termos relevantes distribuídos nas seções principais.' },
          { q: 'Posso repetir a mesma palavra-chave várias vezes?', a: 'Sim, mas com moderação. Repita apenas quando for natural e verdadeiro. Repetição forçada prejudica a leitura humana e pode ser penalizada por alguns sistemas.' },
          { q: 'Como saber quais palavras-chave usar para minha área?', a: 'A forma mais eficiente é ler 5 a 10 anúncios de vagas parecidas com a que você quer. Os termos que se repetem são os mais relevantes para aquele cargo naquele momento.' },
          { q: 'Palavras-chave genéricas como "comunicação" e "proatividade" funcionam?', a: 'Na prática, esses termos raramente fazem diferença no ATS. Sistemas de triagem buscam skills técnicas e ferramentas específicas. Use competências comportamentais como complemento, não como base.' },
        ].map((item, i) => (
          <div key={i} style={s.faqItem}>
            <div style={s.faqQ}>{item.q}</div>
            <div style={s.faqA}>{item.a}</div>
          </div>
        ))}

        <CtaBlock title="Descubra as palavras do seu currículo com uma vaga" sub="Analise gratuitamente a aderência do seu currículo a uma vaga específica." />

      </div>
      <SiteFooter />
    </div>
  );
}

function KwSection({ title, children }) {
  const s = kwStyles;
  return (
    <div style={s.section}>
      <h2 style={s.h2}>{title}</h2>
      {children}
    </div>
  );
}

const kwStyles = {
  page: {
    width: 1440, minHeight: 900,
    background: 'radial-gradient(ellipse 80% 40% at 50% 0%, #f9f8f4 0%, #ecebe5 100%)',
    fontFamily: "'Geist', sans-serif", color: '#0a0a0a', position: 'relative',
  },
  wrap: { maxWidth: 720, margin: '0 auto', padding: '56px 40px 0' },
  kicker: { fontFamily: "'Geist Mono', monospace", fontSize: 10.5, letterSpacing: 1.2, color: '#8a8a85', fontWeight: 500, marginBottom: 16 },
  h1: { fontSize: 40, fontWeight: 500, letterSpacing: -1.5, lineHeight: 1.06, margin: '0 0 12px' },
  meta: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 },
  metaMono: { fontFamily: "'Geist Mono', monospace", fontSize: 11, color: '#8a8a85' },
  metaDot: { color: '#c0beb4' },
  lead: { fontSize: 16.5, color: '#45443e', lineHeight: 1.6, marginBottom: 0 },
  section: { marginBottom: 0, paddingTop: 28, borderTop: '1px solid rgba(10,10,10,0.07)' },
  h2: { fontSize: 21, fontWeight: 500, letterSpacing: -0.6, marginBottom: 12 },
  p: { fontSize: 15, lineHeight: 1.75, color: '#2a2a28', marginBottom: 12 },
  list: { paddingLeft: 20, margin: '0 0 8px' },
  li: { fontSize: 14.5, lineHeight: 1.7, color: '#2a2a28', marginBottom: 4 },
  areaTags: { display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  areaTag: {
    fontFamily: "'Geist Mono', monospace", fontSize: 11, letterSpacing: 0.5,
    background: '#fff', border: '1px solid rgba(10,10,10,0.12)',
    borderRadius: 6, padding: '5px 10px', color: '#0a0a0a', fontWeight: 500,
  },
  techKicker: {
    fontFamily: "'Geist Mono', monospace", fontSize: 10, letterSpacing: 1.2,
    color: '#8a8a85', fontWeight: 500, marginBottom: 16,
  },
  roleBlock: {
    background: '#fafaf6', border: '1px solid rgba(10,10,10,0.08)',
    borderRadius: 12, padding: '16px 18px', marginBottom: 10,
  },
  roleTitle: { fontSize: 14.5, fontWeight: 600, marginBottom: 10, letterSpacing: -0.2 },
  tagGrid: { display: 'flex', flexWrap: 'wrap', gap: 6 },
  kwTag: {
    fontFamily: "'Geist Mono', monospace", fontSize: 11, fontWeight: 500,
    padding: '4px 8px', borderRadius: 5,
    background: 'rgba(198,255,58,0.22)',
    color: '#405410', border: '1px solid rgba(110,150,20,0.2)',
  },
  faqTitle: { fontSize: 22, fontWeight: 500, letterSpacing: -0.7, margin: '28px 0 16px' },
  faqItem: { borderTop: '1px solid rgba(10,10,10,0.07)', paddingTop: 16, paddingBottom: 16 },
  faqQ: { fontSize: 15.5, fontWeight: 500, marginBottom: 6 },
  faqA: { fontSize: 14, color: '#45443e', lineHeight: 1.6 },
};

window.PalavrasChave = PalavrasChave;
