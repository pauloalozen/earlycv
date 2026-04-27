// ========== COMO FUNCIONA ==========
function ComoFunciona() {
  const s = comoStyles;
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
          <a style={{ ...s.navLink, fontWeight: 600, borderBottom: '1.5px solid #0a0a0a', paddingBottom: 1 }}>Como funciona</a>
          <a style={s.navLink}>Preços</a>
          <button style={s.navCta}>Ir para o painel →</button>
        </div>
      </div>

      {/* Hero */}
      <div style={s.hero}>
        <div style={s.kicker}>
          <span style={s.kickerDot} />
          COMO FUNCIONA
        </div>
        <h1 style={s.h1}>
          Três passos para <em style={s.em}>mais entrevistas.</em>
        </h1>
        <div style={s.sub}>
          Menos de 2 minutos. Sem cadastro obrigatório no primeiro uso.
        </div>
      </div>

      {/* Steps */}
      <div style={s.stepsGrid}>
        {[
          {
            num: '01',
            title: 'Envie seu CV e a vaga',
            body: 'Cole o PDF do seu currículo e a descrição da vaga. Funciona com qualquer formato de CV — PDF, DOC ou DOCX.',
            detail: 'Upload · Cole a vaga',
          },
          {
            num: '02',
            title: 'Analisamos e mostramos o que ajustar',
            body: 'Nossa IA compara seu CV com os requisitos da vaga e identifica lacunas, keywords e pontuação ATS.',
            detail: 'Score ATS · Keywords · Gaps',
            highlight: true,
          },
          {
            num: '03',
            title: 'Baixe seu CV pronto para aplicar',
            body: 'Receba o CV reescrito e otimizado para a vaga em PDF e DOCX, pronto para enviar.',
            detail: 'PDF · DOCX · 1 crédito',
          },
        ].map((step) => (
          <div key={step.num} style={{
            ...s.stepCard,
            background: step.highlight ? '#0a0a0a' : '#fafaf6',
            color: step.highlight ? '#fafaf6' : '#0a0a0a',
            border: step.highlight ? 'none' : '1px solid rgba(10,10,10,0.08)',
            transform: step.highlight ? 'translateY(-6px)' : 'none',
            boxShadow: step.highlight
              ? '0 28px 60px -20px rgba(10,10,10,0.4)'
              : '0 1px 2px rgba(0,0,0,0.03)',
          }}>
            <div style={{
              fontFamily: '"Geist Mono", monospace', fontSize: 11,
              letterSpacing: 1.4, fontWeight: 500,
              color: step.highlight ? '#a0a098' : '#8a8a85',
              marginBottom: 24,
            }}>{step.num}</div>
            <div style={{
              width: 32, height: 1,
              background: step.highlight ? 'rgba(198,255,58,0.6)' : 'rgba(10,10,10,0.12)',
              marginBottom: 24,
            }} />
            <div style={{
              fontSize: 20, fontWeight: 500, letterSpacing: -0.7, lineHeight: 1.2,
              marginBottom: 14,
              color: step.highlight ? '#fafaf6' : '#0a0a0a',
            }}>{step.title}</div>
            <div style={{
              fontSize: 14, lineHeight: 1.6,
              color: step.highlight ? '#a0a098' : '#5a5a55',
              marginBottom: 24, flex: 1,
            }}>{step.body}</div>
            <div style={{
              fontFamily: '"Geist Mono", monospace', fontSize: 10,
              letterSpacing: 1, color: step.highlight ? '#7a7a74' : '#a0a098',
              borderTop: step.highlight ? '1px solid rgba(250,250,246,0.08)' : '1px solid rgba(10,10,10,0.06)',
              paddingTop: 14, marginTop: 'auto',
            }}>{step.detail}</div>
          </div>
        ))}
      </div>

      {/* CTA */}
      <div style={s.ctaRow}>
        <button style={s.cta}>Começar agora grátis →</button>
        <div style={s.ctaHint}>Sem cartão de crédito · resultado em segundos</div>
      </div>

      {/* Footer */}
      <div style={s.footer}>
        <span style={s.footerMono}>© earlyCV · 2026</span>
        <div style={s.footerLinks}>
          <a style={s.footerLink}>Termos</a>
          <a style={s.footerLink}>Privacidade</a>
          <a style={s.footerLink}>Contato</a>
        </div>
      </div>
    </div>
  );
}

const comoStyles = {
  page: {
    width: 1440, height: 900,
    background: 'radial-gradient(ellipse 80% 60% at 50% 0%, #f9f8f4 0%, #ecebe5 100%)',
    fontFamily: '"Geist", sans-serif', color: '#0a0a0a',
    position: 'relative', overflow: 'hidden',
    display: 'flex', flexDirection: 'column',
  },
  grain: {
    position: 'absolute', inset: 0, pointerEvents: 'none', opacity: 0.5,
    backgroundImage: `url("data:image/svg+xml;utf8,<svg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.035 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>")`,
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
  navRight: { display: 'flex', alignItems: 'center', gap: 24 },
  navLink: { fontSize: 13, color: '#3a3a38', fontWeight: 450, cursor: 'pointer', textDecoration: 'none' },
  navCta: { background: '#0a0a0a', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 14px', fontSize: 12.5, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' },
  hero: {
    textAlign: 'center', padding: '72px 40px 52px',
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    position: 'relative', zIndex: 2,
  },
  kicker: {
    display: 'inline-flex', alignItems: 'center', gap: 8,
    fontFamily: '"Geist Mono", monospace', fontSize: 10.5, letterSpacing: 1.2,
    fontWeight: 500, color: '#555',
    background: 'rgba(10,10,10,0.04)', border: '1px solid rgba(10,10,10,0.06)',
    padding: '6px 10px', borderRadius: 999, marginBottom: 22,
  },
  kickerDot: { width: 6, height: 6, borderRadius: '50%', background: '#c6ff3a', boxShadow: '0 0 6px #c6ff3a' },
  h1: { fontSize: 58, fontWeight: 500, letterSpacing: -2.2, lineHeight: 1.02, margin: '0 0 14px' },
  em: { fontFamily: '"Instrument Serif", serif', fontStyle: 'italic', fontWeight: 400 },
  sub: { fontSize: 16, color: '#45443e', lineHeight: 1.55 },
  stepsGrid: {
    display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16,
    padding: '0 80px', position: 'relative', zIndex: 2, flex: 1,
    alignItems: 'start',
  },
  stepCard: {
    borderRadius: 16, padding: '28px 28px 24px',
    display: 'flex', flexDirection: 'column', minHeight: 300,
  },
  ctaRow: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
    padding: '36px 40px 32px', position: 'relative', zIndex: 2,
  },
  cta: {
    background: '#0a0a0a', color: '#fff', border: 'none',
    borderRadius: 10, padding: '14px 24px', fontSize: 14.5, fontWeight: 500,
    cursor: 'pointer', fontFamily: 'inherit',
    boxShadow: '0 4px 12px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.08)',
  },
  ctaHint: { fontFamily: '"Geist Mono", monospace', fontSize: 10.5, color: '#8a8a85', letterSpacing: 0.3 },
  footer: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '0 40px 24px', position: 'relative', zIndex: 2,
  },
  footerMono: { fontFamily: '"Geist Mono", monospace', fontSize: 11, color: '#8a8a85' },
  footerLinks: { display: 'flex', gap: 20 },
  footerLink: { fontSize: 12, color: '#6a6a66', cursor: 'pointer' },
};

window.ComoFunciona = ComoFunciona;
