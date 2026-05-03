// ========== BLOG INDEX ==========
function BlogIndex() {
  const s = blogStyles;
  const featured = {
    cat: 'DESTAQUE',
    title: 'Como adaptar currículo para uma vaga sem inventar experiência',
    sub: 'Passo a passo prático para ajustar seu currículo para uma vaga específica mantendo total fidelidade ao seu histórico real.',
    slug: '/blog/como-adaptar-curriculo-para-vaga',
    date: '2026-05-01',
  };
  const posts = [
    { cat: 'CURRÍCULO', min: '6 min', title: 'Como adaptar currículo para uma vaga sem inventar experiência', tag: 'GUIA PRÁTICO', sub: 'Passo a passo prático para ajustar seu currículo para uma vaga específica mantendo total fidelidade ao seu histórico real.', slug: '/blog/como-adaptar-curriculo-para-vaga', date: '2026-05-01' },
    { cat: 'CURRÍCULO', min: '5 min', title: 'Currículo ATS: checklist simples para não ser descartado cedo', tag: 'ATS', sub: 'Entenda o que sistemas ATS costumam ler e como estruturar seu currículo para facilitar triagem sem perder naturalidade.', slug: '/blog/curriculo-ats', date: '2026-04-30' },
    { cat: 'CURRÍCULO', min: '5 min', title: 'Palavras-chave no currículo: como usar sem parecer texto genérico', tag: 'KEYWORDS', sub: 'Aprenda a escolher palavras-chave relevantes para sua vaga-alvo e incorporar termos de forma natural no seu currículo.', slug: '/blog/palavras-chave-curriculo', date: '2026-04-29' },
  ];

  return (
    <div style={s.page}>
      <Grain />
      <NavBar />
      <div style={s.main}>
        {/* Header */}
        <div style={s.header}>
          <div style={s.kicker}>BLOG</div>
          <h1 style={s.h1}>Conteúdo prático para melhorar<br/>suas candidaturas.</h1>
          <div style={s.sub}>Tutoriais diretos para adaptar currículo com base real no seu histórico.</div>
        </div>

        {/* Featured */}
        <div style={s.featuredCard}>
          <div style={s.featuredKicker}>
            <span style={s.featuredKickerDot} />
            {featured.cat}
          </div>
          <div style={s.featuredTitle}>{featured.title}</div>
          <div style={s.featuredSub}>{featured.sub}</div>
          <div style={s.featuredMeta}>
            <span style={s.metaMono}>{featured.slug}</span>
            <span style={s.metaMono}>{featured.date}</span>
          </div>
        </div>

        {/* Posts grid */}
        <div style={s.grid}>
          {posts.map((p, i) => (
            <div key={i} style={s.postCard}>
              <div style={s.postHead}>
                <div style={s.catPill}>{p.cat}</div>
                <div style={s.minRead}>{p.min}</div>
              </div>
              <div style={s.postTitle}>{p.title}</div>
              <div style={s.postTag}>{p.tag}</div>
              <div style={s.postSub}>{p.sub}</div>
              <div style={s.postFoot}>
                <div style={s.metaMono}>{p.slug}</div>
                <div style={s.metaMono}>{p.date}</div>
              </div>
            </div>
          ))}
        </div>

        <CtaBlock />
      </div>
      <SiteFooter />
    </div>
  );
}

// ========== BLOG PAGE1 (artigo) ==========
function BlogPage1() {
  const s = blogStyles;
  const related = [
    { cat: 'CURRÍCULO', min: '5 min', title: 'Currículo ATS: checklist simples para não ser descartado cedo', tag: 'ATS', slug: '/blog/curriculo-ats', date: '2026-04-30' },
    { cat: 'CURRÍCULO', min: '5 min', title: 'Palavras-chave no currículo: como usar sem parecer texto genérico', tag: 'KEYWORDS', slug: '/blog/palavras-chave-curriculo', date: '2026-04-29' },
  ];

  return (
    <div style={s.page}>
      <Grain />
      <NavBar />
      <div style={s.articleWrap}>
        <div style={s.catPill}>CURRÍCULO</div>
        <h1 style={s.articleH1}>Como adaptar currículo para uma vaga sem inventar experiência</h1>
        <div style={s.articleMeta}>
          <span style={s.metaMono}>2026-05-01</span>
          <span style={s.metaDot}>·</span>
          <span style={s.metaMono}>6 min</span>
        </div>
        <div style={s.articleLead}>
          Passo a passo prático para ajustar seu currículo para uma vaga específica mantendo total fidelidade ao seu histórico real.
        </div>

        <CtaBlock title="Compare seu CV com a vaga em minutos" sub="Veja lacunas, pontos fortes e ajustes possíveis sem inventar informações." />

        <p style={s.articleP}>Adaptar currículo não é maquiar perfil. É apresentar sua trajetória com foco na vaga certa.</p>

        <ArticleSection title="Passo 1: Leia a vaga com critério">
          <p style={s.articleP}>Antes de editar qualquer linha, marque: responsabilidades mais repetidas; tecnologias obrigatórias; sinais de senioridade; tipo de impacto esperado (operação, produto, negócio). Isso cria um checklist para priorizar seu histórico real.</p>
        </ArticleSection>

        <ArticleSection title="Passo 2: Reordene para destacar aderência">
          <p style={s.articleP}>Nem sempre a experiência mais recente é a mais relevante. Em cada bloco, coloque primeiro os bullets que conversam com a vaga.</p>
          <p style={s.articleP}>Use verbos concretos e contexto. <span style={{ color: '#c05' }}>errado:</span> "Ajudava e tinha com dados"; <span style={{ color: '#2a6a10', fontWeight: 500 }}>melhor:</span> "Criei dashboard semanal de receita para área comercial, reduzindo retrabalho na reunião de forecast".</p>
        </ArticleSection>

        <ArticleSection title="Passo 3: Ajuste palavras-chave com honestidade">
          <p style={s.articleP}>Use os termos do anúncio apenas quando forem verdadeiros no seu contexto. Se a vaga fala em SQL e você usa SQL, escreva SQL. Se você só teve contato superficial, deixe claro o nível.</p>
        </ArticleSection>

        <ArticleSection title="Passo 4: Revise com foco no ATS">
          <p style={s.articleP}>Formatação limpa, seções claras e normas consistentes ajudam leitura humana e automática. O guia currículo ATS traz um checklist direto.</p>
          <p style={s.articleP}>Fechamento: Adaptação boa aumenta sinal de aderência sem distorcer fatos. Esse equilíbrio protege sua credibilidade no processo inteiro.</p>
          <p style={s.articleP}>Se quiser <em style={{ fontFamily: "'Instrument Serif', serif", fontStyle: 'italic' }}>acelerar</em> essa etapa com um diagnóstico objetivo, use a análise gratuita do EarlyCV em /adaptar.</p>
        </ArticleSection>

        {/* Related */}
        <div style={s.relatedLabel}>Leituras relacionadas</div>
        <div style={s.relatedGrid}>
          {related.map((r, i) => (
            <div key={i} style={s.relatedCard}>
              <div style={s.postHead}>
                <div style={s.catPill}>{r.cat}</div>
                <div style={s.minRead}>{r.min}</div>
              </div>
              <div style={{ fontSize: 15, fontWeight: 500, letterSpacing: -0.3, marginBottom: 6, lineHeight: 1.3 }}>{r.title}</div>
              <div style={s.postTag}>{r.tag}</div>
              <div style={s.postFoot}>
                <div style={s.metaMono}>{r.slug}</div>
                <div style={s.metaMono}>{r.date}</div>
              </div>
            </div>
          ))}
        </div>

        <CtaBlock />

        {/* FAQ */}
        <div style={s.faqTitle}>FAQ</div>
        <FaqItem q="Preciso mudar meu currículo para cada vaga?" a="Em geral sim. Ajustes de foco, palavras-chave e ordem das experiências aumentam clareza para recrutadores e ATS." />
        <FaqItem q="Adaptar currículo significa inventar informação?" a="Não. Adaptar é reorganizar o que você já fez, sem criar cargos, resultados ou tecnologias que não existem." />
      </div>
      <SiteFooter />
    </div>
  );
}

function ArticleSection({ title, children }) {
  const s = blogStyles;
  return (
    <div style={s.articleSection}>
      <h2 style={s.articleH2}>{title}</h2>
      {children}
    </div>
  );
}

function FaqItem({ q, a }) {
  const s = blogStyles;
  return (
    <div style={s.faqItem}>
      <div style={s.faqQ}>{q}</div>
      <div style={s.faqA}>{a}</div>
    </div>
  );
}

const blogStyles = {
  page: {
    width: 1440, minHeight: 900,
    background: 'radial-gradient(ellipse 80% 40% at 50% 0%, #f9f8f4 0%, #ecebe5 100%)',
    fontFamily: "'Geist', sans-serif", color: '#0a0a0a', position: 'relative',
  },
  main: { maxWidth: 860, margin: '0 auto', padding: '56px 40px 0' },
  header: { marginBottom: 40 },
  kicker: { fontFamily: "'Geist Mono', monospace", fontSize: 10.5, letterSpacing: 1.2, color: '#8a8a85', fontWeight: 500, marginBottom: 16 },
  h1: { fontSize: 52, fontWeight: 500, letterSpacing: -2, lineHeight: 1.04, margin: '0 0 14px' },
  sub: { fontSize: 16, color: '#45443e', lineHeight: 1.55 },
  // featured card
  featuredCard: {
    background: '#fafaf6', border: '1px solid rgba(10,10,10,0.08)',
    borderRadius: 14, padding: '28px 32px', marginBottom: 24,
    boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
  },
  featuredKicker: {
    display: 'inline-flex', alignItems: 'center', gap: 7,
    fontFamily: "'Geist Mono', monospace", fontSize: 10, letterSpacing: 1.2,
    color: '#8a8a85', fontWeight: 500, marginBottom: 14,
  },
  featuredKickerDot: { width: 5, height: 5, borderRadius: '50%', background: '#c6ff3a', boxShadow: '0 0 5px #c6ff3a' },
  featuredTitle: { fontSize: 28, fontWeight: 500, letterSpacing: -1, lineHeight: 1.2, marginBottom: 10 },
  featuredSub: { fontSize: 15, color: '#45443e', lineHeight: 1.6, marginBottom: 18 },
  featuredMeta: { display: 'flex', gap: 20 },
  // grid
  grid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 0 },
  postCard: {
    background: '#fafaf6', border: '1px solid rgba(10,10,10,0.08)',
    borderRadius: 12, padding: '18px 20px',
    display: 'flex', flexDirection: 'column', gap: 0,
    boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
  },
  postHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  catPill: {
    display: 'inline-flex', alignItems: 'center',
    fontFamily: "'Geist Mono', monospace", fontSize: 9.5, letterSpacing: 1,
    color: '#5a5a55', fontWeight: 500,
    background: 'rgba(10,10,10,0.05)', border: '1px solid rgba(10,10,10,0.08)',
    padding: '3px 8px', borderRadius: 4,
  },
  minRead: { fontFamily: "'Geist Mono', monospace", fontSize: 10.5, color: '#8a8a85' },
  postTitle: { fontSize: 15.5, fontWeight: 500, letterSpacing: -0.3, lineHeight: 1.3, marginBottom: 6 },
  postTag: { fontFamily: "'Geist Mono', monospace", fontSize: 10, letterSpacing: 0.8, color: '#8a8a85', marginBottom: 8 },
  postSub: { fontSize: 13, color: '#5a5a55', lineHeight: 1.55, flex: 1, marginBottom: 16 },
  postFoot: { display: 'flex', flexDirection: 'column', gap: 2, marginTop: 'auto' },
  metaMono: { fontFamily: "'Geist Mono', monospace", fontSize: 10.5, color: '#a0a098', letterSpacing: 0.2 },
  metaDot: { color: '#c0beb4' },
  // article
  articleWrap: { maxWidth: 660, margin: '0 auto', padding: '56px 40px 0' },
  articleH1: { fontSize: 42, fontWeight: 500, letterSpacing: -1.6, lineHeight: 1.05, margin: '16px 0 12px' },
  articleMeta: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 },
  articleLead: { fontSize: 17, color: '#45443e', lineHeight: 1.6, marginBottom: 0, fontWeight: 400 },
  articleSection: { marginBottom: 28, paddingTop: 28, borderTop: '1px solid rgba(10,10,10,0.07)' },
  articleH2: { fontSize: 20, fontWeight: 500, letterSpacing: -0.6, marginBottom: 12 },
  articleP: { fontSize: 15, lineHeight: 1.75, color: '#2a2a28', marginBottom: 12 },
  relatedLabel: { fontSize: 22, fontWeight: 500, letterSpacing: -0.7, marginBottom: 16, marginTop: 8 },
  relatedGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 0 },
  relatedCard: {
    background: '#fafaf6', border: '1px solid rgba(10,10,10,0.08)',
    borderRadius: 12, padding: '18px 20px',
  },
  faqTitle: { fontSize: 22, fontWeight: 500, letterSpacing: -0.7, margin: '8px 0 16px' },
  faqItem: { borderTop: '1px solid rgba(10,10,10,0.07)', paddingTop: 16, paddingBottom: 16 },
  faqQ: { fontSize: 15.5, fontWeight: 500, marginBottom: 6 },
  faqA: { fontSize: 14, color: '#45443e', lineHeight: 1.6 },
};

window.BlogIndex = BlogIndex;
window.BlogPage1 = BlogPage1;
