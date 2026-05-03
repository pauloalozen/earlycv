// ========== PLANS AFTER ==========

function PlansAfter() {
  const s = plansStyles;
  return (
    <div style={s.page}>
      <div style={s.grain} />

      {/* Nav */}
      <div style={s.nav}>
        <div style={s.logoWrap}>
          <div style={s.logoDot} />
          <div style={s.logo}>earlyCV</div>
          <div style={s.logoVer}>v1.2</div>
        </div>
        <div style={s.navRight}>
          <a style={s.navLink}>Dashboard</a>
          <a style={s.navLink}>Análises</a>
          <button style={s.navPill}>
            <span style={s.navAvatar}>P</span> Paulo
            <span style={s.navChev}>▾</span>
          </button>
        </div>
      </div>

      <div style={s.main}>
        {/* Header */}
        <div style={s.header}>
          <div style={s.kicker}>
            <span style={s.kickerDot} />
            NOSSOS PLANOS · PREÇOS EM BRL
          </div>
          <h1 style={s.h1}>
            Seu CV não passa no<br/>
            filtro automático. <em style={s.em}>Mude isso.</em>
          </h1>
          <div style={s.sub}>
            Um CV bem ajustado é a diferença entre ser ignorado ou ser chamado para entrevista.
            Escolha o ritmo que combina com sua busca.
          </div>

          {/* Toggle mensal/anual */}
          <div style={s.toggleRow}>
            <div style={s.toggle}>
              <span style={s.toggleActive}>MENSAL</span>
              <span style={s.toggleItem}>ANUAL <span style={s.toggleDiscount}>−20%</span></span>
            </div>
            <div style={s.moneyBack}>
              <span style={s.moneyBackIcon}>✓</span>
              Garantia de reembolso em 7 dias
            </div>
          </div>
        </div>

        {/* Plans grid */}
        <div style={s.plansGrid}>
          <Plan
            tag="FREE"
            name="Free"
            tagline="Para começar sem pagar."
            price="0"
            cents="00"
            cta="Começar grátis"
            features={[
              { text: 'Análises de vaga ilimitadas', hit: true },
              { text: 'Score de compatibilidade ATS', hit: true },
              { text: 'Análise de keywords da vaga', hit: true },
              { text: 'Sem cartão de crédito', hit: true },
              { text: 'Download do CV otimizado', hit: false },
              { text: 'Processamento prioritário', hit: false },
            ]}
          />
          <Plan
            tag="STARTER"
            name="Starter"
            tagline="Para uma vaga específica."
            price="11"
            cents="90"
            cta="Ajustar meu CV"
            features={[
              { text: '1 crédito de download de CV', hit: true },
              { text: 'Análises ilimitadas', hit: true },
              { text: 'Score de compatibilidade ATS', hit: true },
              { text: 'Análise de keywords da vaga', hit: true },
              { text: 'Download em PDF e DOCX', hit: true },
              { text: 'Pontos fortes e melhorias', hit: true },
            ]}
          />
          <Plan
            tag="PRO"
            name="Pro"
            tagline="Para quem aplica em várias vagas."
            price="29"
            cents="90"
            cta="Aumentar minhas chances"
            highlight
            features={[
              { text: '3 créditos de download de CV', hit: true },
              { text: 'Análises ilimitadas', hit: true },
              { text: 'Score de compatibilidade ATS', hit: true },
              { text: 'Análise de keywords da vaga', hit: true },
              { text: 'Download em PDF e DOCX', hit: true },
              { text: 'Pontos fortes e melhorias', hit: true },
              { text: 'Processamento prioritário', hit: true },
            ]}
          />
          <Plan
            tag="TURBO"
            name="Turbo"
            tagline="Para quem aplica todos os dias."
            price="59"
            cents="90"
            cta="Aplicar para mais vagas"
            features={[
              { text: '10 créditos de download', hit: true },
              { text: 'Análises ilimitadas', hit: true },
              { text: 'Score de compatibilidade ATS', hit: true },
              { text: 'Análise de keywords da vaga', hit: true },
              { text: 'Download em PDF e DOCX', hit: true },
              { text: 'Pontos fortes e melhorias', hit: true },
              { text: 'Processamento prioritário', hit: true },
            ]}
          />
        </div>

        {/* Trust footer */}
        <div style={s.trustStrip}>
          <div style={s.trustItem}>
            <span style={s.trustIcon}>🔒</span>
            <div>
              <div style={s.trustTitle}>Pagamento seguro</div>
              <div style={s.trustSub}>Mercado Pago · Stripe</div>
            </div>
          </div>
          <div style={s.trustDiv} />
          <div style={s.trustItem}>
            <span style={s.trustIcon}>⚡</span>
            <div>
              <div style={s.trustTitle}>Acesso imediato</div>
              <div style={s.trustSub}>Liberação automática</div>
            </div>
          </div>
          <div style={s.trustDiv} />
          <div style={s.trustItem}>
            <span style={s.trustIcon}>↺</span>
            <div>
              <div style={s.trustTitle}>Sem renovação</div>
              <div style={s.trustSub}>Você paga quando quer</div>
            </div>
          </div>
          <div style={s.trustDiv} />
          <div style={s.trustItem}>
            <span style={s.trustIcon}>✓</span>
            <div>
              <div style={s.trustTitle}>Compatível com ATS</div>
              <div style={s.trustSub}>Gupy · LinkedIn · Kenoby</div>
            </div>
          </div>
        </div>

        {/* FAQ mini */}
        <div style={s.faq}>
          <div style={s.faqLabel}>PERGUNTAS FREQUENTES</div>
          <div style={s.faqGrid}>
            <FaqItem q="O que é um crédito?" a="Cada crédito libera o download de um CV otimizado em PDF e DOCX. Análises são sempre ilimitadas em todos os planos." />
            <FaqItem q="Posso mudar de plano?" a="Sim, a qualquer momento. Créditos não-utilizados são preservados. Não há fidelidade." />
            <FaqItem q="Como funciona o reembolso?" a="7 dias, sem perguntas. Se o earlyCV não te ajudou, devolvemos 100% do valor pago." />
            <FaqItem q="Meus dados são privados?" a="Sim. CVs e vagas nunca são usados para treinar modelos e são removidos após 30 dias." />
          </div>
        </div>
      </div>
    </div>
  );
}

function Plan({ tag, name, tagline, price, cents, cta, features, highlight }) {
  const dark = highlight;
  return (
    <div style={{
      background: dark ? '#0a0a0a' : '#fafaf6',
      color: dark ? '#fafaf6' : '#0a0a0a',
      border: dark ? '1px solid #0a0a0a' : '1px solid rgba(10,10,10,0.08)',
      borderRadius: 16,
      padding: '22px 22px 24px',
      position: 'relative',
      boxShadow: dark
        ? '0 28px 70px -20px rgba(10,10,10,0.4)'
        : '0 1px 2px rgba(0,0,0,0.02)',
      transform: dark ? 'translateY(-8px)' : 'none',
    }}>
      {highlight && (
        <div style={{
          position: 'absolute', top: -10, right: 18,
          background: '#c6ff3a', color: '#0a0a0a',
          fontFamily: '"Geist Mono", monospace', fontSize: 10,
          fontWeight: 600, letterSpacing: 1,
          padding: '4px 10px', borderRadius: 999,
        }}>MAIS ESCOLHIDO</div>
      )}

      <div style={{
        fontFamily: '"Geist Mono", monospace', fontSize: 10,
        letterSpacing: 1.5, color: dark ? '#a0a098' : '#8a8a85',
        fontWeight: 500, marginBottom: 10,
      }}>{tag}</div>

      <div style={{
        fontSize: 22, fontWeight: 500, letterSpacing: -0.8,
        color: dark ? '#fafaf6' : '#0a0a0a', marginBottom: 4,
      }}>{name}</div>

      <div style={{
        fontSize: 13, color: dark ? '#a0a098' : '#6a6560',
        marginBottom: 20, lineHeight: 1.4,
      }}>{tagline}</div>

      <div style={{
        display: 'flex', alignItems: 'baseline', gap: 2,
        marginBottom: 20,
        paddingBottom: 20,
        borderBottom: dark ? '1px solid rgba(250,250,246,0.1)' : '1px solid rgba(10,10,10,0.08)',
      }}>
        <span style={{
          fontFamily: '"Geist Mono", monospace', fontSize: 14,
          color: dark ? '#a0a098' : '#6a6560', marginRight: 2,
        }}>R$</span>
        <span style={{
          fontSize: 46, fontWeight: 500, letterSpacing: -2,
          color: dark ? '#fafaf6' : '#0a0a0a',
          fontVariantNumeric: 'tabular-nums', lineHeight: 1,
        }}>{price}</span>
        <span style={{
          fontSize: 16, color: dark ? '#a0a098' : '#8a8a85', fontWeight: 500,
          letterSpacing: -0.3, marginLeft: 2,
        }}>,{cents}</span>
        <span style={{
          fontFamily: '"Geist Mono", monospace', fontSize: 10.5,
          color: dark ? '#7a7a74' : '#8a8a85', letterSpacing: 0.3,
          marginLeft: 6,
        }}>/mês</span>
      </div>

      <button style={{
        width: '100%',
        background: dark ? '#c6ff3a' : '#0a0a0a',
        color: dark ? '#0a0a0a' : '#fafaf6',
        border: 'none', borderRadius: 10,
        padding: '12px', fontSize: 13.5, fontWeight: 500,
        cursor: 'pointer', fontFamily: 'inherit',
        marginBottom: 20,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        boxShadow: dark ? '0 6px 14px rgba(198,255,58,0.25)' : '0 4px 12px rgba(10,10,10,0.12)',
      }}>
        {cta} <span>→</span>
      </button>

      <div style={{
        fontFamily: '"Geist Mono", monospace', fontSize: 9.5,
        letterSpacing: 1, color: dark ? '#7a7a74' : '#8a8a85',
        fontWeight: 500, marginBottom: 10,
      }}>INCLUSO</div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {features.map((f, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', gap: 8,
            fontSize: 12.5,
            color: f.hit
              ? (dark ? '#e8e7df' : '#2a2a28')
              : (dark ? '#555551' : '#b0aea6'),
            opacity: f.hit ? 1 : 0.7,
          }}>
            <span style={{
              width: 14, height: 14, borderRadius: '50%',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 8, fontWeight: 700,
              background: f.hit
                ? (dark ? 'rgba(198,255,58,0.9)' : 'rgba(198,255,58,0.4)')
                : (dark ? 'rgba(250,250,246,0.06)' : 'rgba(10,10,10,0.05)'),
              color: f.hit ? (dark ? '#0a0a0a' : '#405410') : (dark ? '#555551' : '#b0aea6'),
            }}>{f.hit ? '✓' : '—'}</span>
            {f.text}
          </div>
        ))}
      </div>
    </div>
  );
}

function FaqItem({ q, a }) {
  return (
    <div style={{
      padding: '18px 20px',
      background: '#fafaf6',
      border: '1px solid rgba(10,10,10,0.08)',
      borderRadius: 12,
    }}>
      <div style={{
        fontSize: 14.5, fontWeight: 500, letterSpacing: -0.2,
        marginBottom: 6,
      }}>{q}</div>
      <div style={{
        fontSize: 13, color: '#5a5a55', lineHeight: 1.55,
      }}>{a}</div>
    </div>
  );
}

const plansStyles = {
  page: {
    width: 1440, minHeight: 1400,
    background: 'radial-gradient(ellipse 80% 60% at 50% 0%, #f9f8f4 0%, #ecebe5 100%)',
    fontFamily: '"Geist", sans-serif', color: '#0a0a0a', position: 'relative',
  },
  grain: {
    position: 'absolute', inset: 0, pointerEvents: 'none', opacity: 0.5,
    backgroundImage: `url("data:image/svg+xml;utf8,<svg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.035 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>")`,
    mixBlendMode: 'multiply',
  },
  nav: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '20px 32px', position: 'relative', zIndex: 2,
    borderBottom: '1px solid rgba(0,0,0,0.04)',
  },
  logoWrap: { display: 'flex', alignItems: 'center', gap: 10 },
  logoDot: {
    width: 18, height: 18, borderRadius: 5, background: '#0a0a0a',
    boxShadow: 'inset -2px -2px 0 rgba(198,255,58,0.85)',
  },
  logo: { fontSize: 17, fontWeight: 600, letterSpacing: -0.4 },
  logoVer: {
    fontFamily: '"Geist Mono", monospace', fontSize: 10, color: '#8a8a85',
    border: '1px solid #d8d6ce', borderRadius: 3, padding: '1px 5px', fontWeight: 500,
  },
  navRight: { display: 'flex', alignItems: 'center', gap: 20 },
  navLink: { fontSize: 13, color: '#3a3a38', fontWeight: 450, cursor: 'pointer' },
  navPill: {
    display: 'inline-flex', alignItems: 'center', gap: 8,
    background: '#fff', border: '1px solid rgba(10,10,10,0.08)',
    borderRadius: 999, padding: '5px 10px 5px 5px',
    fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit',
  },
  navAvatar: {
    width: 24, height: 24, borderRadius: '50%',
    background: '#0a0a0a', color: '#fafaf6',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 11, fontWeight: 600,
  },
  navChev: { fontSize: 9, color: '#8a8a85' },

  main: { padding: '56px 64px 60px', position: 'relative', zIndex: 2, maxWidth: 1440, margin: '0 auto' },
  header: { textAlign: 'center', marginBottom: 48, display: 'flex', flexDirection: 'column', alignItems: 'center' },
  kicker: {
    display: 'inline-flex', alignItems: 'center', gap: 8,
    fontFamily: '"Geist Mono", monospace',
    fontSize: 10.5, letterSpacing: 1.2, fontWeight: 500, color: '#555',
    background: 'rgba(10,10,10,0.04)',
    border: '1px solid rgba(10,10,10,0.06)',
    padding: '6px 10px', borderRadius: 999,
    marginBottom: 22,
  },
  kickerDot: { width: 6, height: 6, borderRadius: '50%', background: '#c6ff3a', boxShadow: '0 0 6px #c6ff3a' },
  h1: {
    fontSize: 58, fontWeight: 500, letterSpacing: -2.3, lineHeight: 1,
    margin: '0 0 18px', textAlign: 'center',
  },
  em: { fontFamily: '"Instrument Serif", serif', fontStyle: 'italic', fontWeight: 400 },
  sub: {
    fontSize: 16, color: '#45443e', lineHeight: 1.55,
    maxWidth: 560, textAlign: 'center', marginBottom: 24,
  },
  toggleRow: { display: 'flex', alignItems: 'center', gap: 18, marginTop: 4 },
  toggle: {
    display: 'flex', background: '#fafaf6', border: '1px solid rgba(10,10,10,0.08)',
    borderRadius: 999, padding: 3,
    fontFamily: '"Geist Mono", monospace', fontSize: 10.5, fontWeight: 500, letterSpacing: 0.8,
  },
  toggleActive: {
    background: '#0a0a0a', color: '#fafaf6', borderRadius: 999,
    padding: '6px 14px', cursor: 'pointer',
  },
  toggleItem: {
    padding: '6px 14px', color: '#8a8a85', cursor: 'pointer',
    display: 'inline-flex', alignItems: 'center', gap: 6,
  },
  toggleDiscount: { color: '#405410' },
  moneyBack: {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    fontFamily: '"Geist Mono", monospace', fontSize: 10.5,
    color: '#6a6560', letterSpacing: 0.3,
  },
  moneyBackIcon: {
    width: 14, height: 14, borderRadius: '50%',
    background: 'rgba(198,255,58,0.4)', color: '#405410',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 9, fontWeight: 700,
  },

  plansGrid: {
    display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14,
    alignItems: 'start', marginBottom: 36,
  },

  trustStrip: {
    display: 'flex', alignItems: 'center', gap: 24,
    padding: '20px 26px', background: '#fafaf6',
    border: '1px solid rgba(10,10,10,0.08)', borderRadius: 14,
    marginBottom: 36,
  },
  trustItem: { display: 'flex', alignItems: 'center', gap: 12, flex: 1 },
  trustIcon: {
    width: 32, height: 32, borderRadius: 8,
    background: 'rgba(10,10,10,0.04)',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 15,
  },
  trustTitle: { fontSize: 13, fontWeight: 500, letterSpacing: -0.2 },
  trustSub: {
    fontFamily: '"Geist Mono", monospace', fontSize: 10.5,
    color: '#8a8a85', letterSpacing: 0.2, marginTop: 1,
  },
  trustDiv: { width: 1, height: 32, background: 'rgba(10,10,10,0.08)' },

  faq: { marginTop: 8 },
  faqLabel: {
    fontFamily: '"Geist Mono", monospace', fontSize: 10,
    letterSpacing: 1.2, color: '#8a8a85', fontWeight: 500, marginBottom: 12,
  },
  faqGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 },
};

window.PlansAfter = PlansAfter;
