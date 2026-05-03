// ========== LANDING BEFORE ==========
// Recriação fiel da landing atual do Figma.

function LandingBefore() {
  const styles = beforeStyles;
  return (
    <div style={styles.page}>
      {/* Nav */}
      <div style={styles.nav}>
        <div style={styles.logo}>earlyCV</div>
        <button style={styles.navBtn}>
          <span style={{ fontSize: 11 }}>👤</span> Entrar
        </button>
      </div>

      {/* Hero */}
      <div style={styles.hero}>
        <div style={styles.pill}>
          <span style={styles.dot}></span>
          Baseado na vaga que você quer.
        </div>

        <h1 style={styles.h1}>
          Um CV ajustado para cada vaga.<br/>
          Automático.
        </h1>

        <p style={styles.sub}>
          Seu CV não passa porque não está alinhado com a vaga. A gente<br/>
          ajusta isso pra você.
        </p>

        <button style={styles.cta}>
          <span style={{ color: '#c6ff3a' }}>⚡</span> Adaptar meu CV para uma vaga
        </button>

        <div style={styles.steps}>
          <span>Cole a vaga</span>
          <span style={styles.arrow}>→</span>
          <span>Envie seu CV</span>
          <span style={styles.arrow}>→</span>
          <span>Veja o que ajustar</span>
        </div>

        <div style={styles.bullets}>
          <span><span style={styles.greenDot}></span> Ajustado para cada vaga específica</span>
          <span><span style={styles.greenDot}></span> Análise grátis. Sem cartão.</span>
          <span><span style={styles.greenDot}></span> Resultado em segundos</span>
        </div>
      </div>

      {/* Footer */}
      <div style={styles.footer}>
        <span>Termos de uso</span>
        <span style={{ opacity: 0.4 }}>·</span>
        <span>Privacidade</span>
      </div>
    </div>
  );
}

const beforeStyles = {
  page: {
    width: 1440, height: 900,
    background: '#f4f3f0',
    fontFamily: '"Geist", -apple-system, system-ui, sans-serif',
    position: 'relative',
    color: '#1a1a1a',
    overflow: 'hidden',
  },
  nav: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '22px 40px',
  },
  logo: {
    fontSize: 19, fontWeight: 600, letterSpacing: -0.5,
    fontFamily: '"Geist", sans-serif',
  },
  navBtn: {
    background: '#fff', border: '1px solid #e5e3dc', borderRadius: 10,
    padding: '8px 16px', fontSize: 13, fontWeight: 500,
    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
    fontFamily: 'inherit',
  },
  hero: {
    textAlign: 'center',
    padding: '120px 40px 40px',
    display: 'flex', flexDirection: 'column', alignItems: 'center',
  },
  pill: {
    background: '#0f0f0f', color: '#fff',
    borderRadius: 999, padding: '7px 14px',
    fontSize: 12, fontWeight: 500,
    display: 'inline-flex', alignItems: 'center', gap: 8,
    marginBottom: 28,
  },
  dot: {
    width: 7, height: 7, borderRadius: '50%', background: '#c6ff3a',
    display: 'inline-block',
  },
  h1: {
    fontSize: 54, fontWeight: 600, letterSpacing: -1.5, lineHeight: 1.15,
    margin: '0 0 24px', color: '#0f0f0f',
  },
  sub: {
    fontSize: 16, lineHeight: 1.55, color: '#666',
    margin: '0 0 32px', fontWeight: 400,
  },
  cta: {
    background: '#0f0f0f', color: '#fff', border: 'none',
    borderRadius: 12, padding: '13px 24px',
    fontSize: 14, fontWeight: 500,
    cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8,
    fontFamily: 'inherit',
    marginBottom: 18,
  },
  steps: {
    display: 'flex', gap: 10, alignItems: 'center',
    fontSize: 12, color: '#666', marginBottom: 44,
  },
  arrow: { color: '#bbb' },
  bullets: {
    display: 'flex', gap: 32,
    fontSize: 12, color: '#555',
  },
  greenDot: {
    width: 6, height: 6, borderRadius: '50%',
    background: '#7fb800', display: 'inline-block', marginRight: 6,
  },
  footer: {
    position: 'absolute', bottom: 28, left: 0, right: 0,
    display: 'flex', justifyContent: 'center', gap: 14,
    fontSize: 12, color: '#999',
  },
};

window.LandingBefore = LandingBefore;
