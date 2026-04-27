// ========== LANDING AFTER ==========
// Versão melhorada: premium, elegante, hero com widget animado,
// hierarquia refeita, micro-detalhes mono, prova social sutil.

function LandingAfter() {
  const s = afterStyles;
  const [score, setScore] = React.useState(34);
  const [hover, setHover] = React.useState(false);

  // Anima o score de 34 → 92 em loop
  React.useEffect(() => {
    let frame;
    let start = performance.now();
    const dur = 2800;
    const pause = 1500;
    function tick(now) {
      const t = (now - start);
      if (t < dur) {
        const p = t / dur;
        const eased = 1 - Math.pow(1 - p, 3);
        setScore(Math.round(34 + (92 - 34) * eased));
      } else if (t < dur + pause) {
        setScore(92);
      } else {
        start = now;
        setScore(34);
      }
      frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <div style={s.page}>
      {/* Noise overlay */}
      <div style={s.grain} />

      {/* Nav */}
      <div style={s.nav}>
        <div style={s.logoWrap}>
          <div style={s.logoDot} />
          <div style={s.logo}>earlyCV</div>
          <div style={s.logoVer}>v1.2</div>
        </div>
        <div style={s.navRight}>
          <a style={s.navLink}>Como funciona</a>
          <a style={s.navLink}>Preços</a>
          <a style={s.navLink}>Sobre</a>
          <button style={s.navBtn}>Entrar</button>
          <button style={s.navCta}>Começar grátis →</button>
        </div>
      </div>

      {/* Hero */}
      <div style={s.hero}>
        <div style={s.heroLeft}>
          <div style={s.kicker}>
            <span style={s.kickerDot} />
            <span>FERRAMENTA · BASEADA NA VAGA</span>
          </div>

          <h1 style={s.h1}>
            Um CV <em style={s.emItalic}>ajustado</em><br/>
            para cada vaga.<br/>
            <span style={s.h1Accent}>Automático.</span>
          </h1>

          <p style={s.sub}>
            Seu CV não passa porque não está alinhado com a vaga.
            A gente ajusta isso pra você em menos de 30 segundos.
          </p>

          <div style={s.ctaRow}>
            <button
              style={{
                ...s.cta,
                transform: hover ? 'translateY(-1px)' : 'none',
                boxShadow: hover
                  ? '0 10px 24px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.08)'
                  : '0 4px 12px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.08)',
              }}
              onMouseEnter={() => setHover(true)}
              onMouseLeave={() => setHover(false)}
            >
              <span>Adaptar meu CV</span>
              <span style={{
                ...s.ctaArrow,
                transform: hover ? 'translateX(4px)' : 'none',
              }}>→</span>
            </button>
            <button style={s.ctaSecondary}>
              Ver exemplo ao vivo
            </button>
          </div>

          <div style={s.metaRow}>
            <div style={s.metaItem}>
              <span style={s.metaNum}>30s</span>
              <span style={s.metaLabel}>análise<br/>completa</span>
            </div>
            <div style={s.metaDiv} />
            <div style={s.metaItem}>
              <span style={s.metaNum}>87%</span>
              <span style={s.metaLabel}>aprovação<br/>média no ATS</span>
            </div>
            <div style={s.metaDiv} />
            <div style={s.metaItem}>
              <span style={s.metaNum}>12k+</span>
              <span style={s.metaLabel}>CVs<br/>analisados</span>
            </div>
          </div>
        </div>

        {/* Animated ATS widget */}
        <div style={s.heroRight}>
          <AtsWidget score={score} />
        </div>
      </div>

      {/* Thin social-proof strip */}
      <div style={s.proof}>
        <span style={s.proofLabel}>CANDIDATOS CONTRATADOS EM</span>
        <div style={s.proofLogos}>
          <span style={s.proofLogo}>Itaú</span>
          <span style={s.proofDot}>·</span>
          <span style={s.proofLogo}>Nubank</span>
          <span style={s.proofDot}>·</span>
          <span style={s.proofLogo}>Stone</span>
          <span style={s.proofDot}>·</span>
          <span style={s.proofLogo}>iFood</span>
          <span style={s.proofDot}>·</span>
          <span style={s.proofLogo}>Mercado Livre</span>
          <span style={s.proofDot}>·</span>
          <span style={s.proofLogo}>Globo</span>
        </div>
      </div>

      {/* Bottom-left helper */}
      <div style={s.helper}>
        <div style={s.helperCircle}>?</div>
      </div>

      {/* Footer */}
      <div style={s.footer}>
        <div style={s.footerLeft}>
          <span style={s.footerMono}>© earlyCV · 2026</span>
        </div>
        <div style={s.footerRight}>
          <a style={s.footerLink}>Termos</a>
          <a style={s.footerLink}>Privacidade</a>
          <a style={s.footerLink}>Status</a>
        </div>
      </div>
    </div>
  );
}

// ========== ATS Widget ==========
function AtsWidget({ score }) {
  const s = atsStyles;
  // gauge
  const R = 72, C = 2 * Math.PI * R;
  const pct = score / 100;
  const dash = C * pct;

  const keywords = [
    { word: 'React', hit: true },
    { word: 'TypeScript', hit: true },
    { word: 'Node.js', hit: true },
    { word: 'AWS', hit: score > 60 },
    { word: 'CI/CD', hit: score > 70 },
    { word: 'GraphQL', hit: score > 80 },
  ];

  return (
    <div style={s.card}>
      {/* window chrome */}
      <div style={s.chrome}>
        <div style={{ ...s.dot, background: '#ff5f57' }} />
        <div style={{ ...s.dot, background: '#febc2e' }} />
        <div style={{ ...s.dot, background: '#28c840' }} />
        <div style={s.chromeTitle}>cv-analysis.earlyCV</div>
      </div>

      <div style={s.body}>
        <div style={s.bodyLabel}>
          <span style={{ ...s.liveDot, background: score >= 80 ? '#c6ff3a' : '#f5c518' }} />
          ANALISANDO CV PARA VAGA · SENIOR DEV
        </div>

        <div style={s.gaugeWrap}>
          <svg width="180" height="180" viewBox="0 0 180 180">
            <circle cx="90" cy="90" r={R} stroke="#1a1a1a" strokeWidth="10" fill="none" />
            <circle
              cx="90" cy="90" r={R}
              stroke={score >= 80 ? '#c6ff3a' : '#f5c518'}
              strokeWidth="10" fill="none"
              strokeDasharray={`${dash} ${C}`}
              strokeDashoffset={0}
              transform="rotate(-90 90 90)"
              strokeLinecap="round"
            />
          </svg>
          <div style={s.gaugeCenter}>
            <div style={s.gaugeNum}>{score}</div>
            <div style={s.gaugeLabel}>ATS SCORE</div>
          </div>
        </div>

        <div style={s.kwLabel}>Palavras-chave detectadas</div>
        <div style={s.kwGrid}>
          {keywords.map(k => (
            <div key={k.word} style={{ ...s.kw, ...(k.hit ? s.kwHit : s.kwMiss) }}>
              {k.hit ? '✓' : '○'} {k.word}
            </div>
          ))}
        </div>

        <div style={s.progressRow}>
          <div style={s.progressLabel}>
            <span>Ajustando seções</span>
            <span style={s.progressPct}>{Math.round(pct * 100)}%</span>
          </div>
          <div style={s.progressTrack}>
            <div style={{ ...s.progressBar, width: `${pct * 100}%` }} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ========== Styles ==========
const afterStyles = {
  page: {
    width: 1440, height: 900,
    background: 'radial-gradient(ellipse 80% 60% at 50% 0%, #f9f8f4 0%, #ecebe5 100%)',
    fontFamily: '"Geist", -apple-system, system-ui, sans-serif',
    color: '#0a0a0a',
    position: 'relative',
    overflow: 'hidden',
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
    width: 18, height: 18, borderRadius: 5,
    background: '#0a0a0a',
    position: 'relative',
    boxShadow: 'inset -2px -2px 0 rgba(198,255,58,0.85)',
  },
  logo: {
    fontSize: 17, fontWeight: 600, letterSpacing: -0.4,
  },
  logoVer: {
    fontFamily: '"Geist Mono", monospace',
    fontSize: 10, color: '#8a8a85',
    border: '1px solid #d8d6ce', borderRadius: 3,
    padding: '1px 5px', marginLeft: 2,
    fontWeight: 500,
  },
  navRight: { display: 'flex', alignItems: 'center', gap: 28 },
  navLink: {
    fontSize: 13, color: '#3a3a38', fontWeight: 450,
    cursor: 'pointer', letterSpacing: -0.1,
  },
  navBtn: {
    background: 'transparent', border: 'none',
    fontSize: 13, fontWeight: 500, cursor: 'pointer',
    padding: '8px 4px', color: '#0a0a0a',
    fontFamily: 'inherit',
  },
  navCta: {
    background: '#0a0a0a', color: '#fff', border: 'none',
    borderRadius: 8, padding: '9px 14px',
    fontSize: 12.5, fontWeight: 500,
    cursor: 'pointer', fontFamily: 'inherit',
    letterSpacing: -0.1,
    boxShadow: '0 1px 2px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.08)',
  },
  hero: {
    display: 'grid', gridTemplateColumns: '1.05fr 0.95fr',
    gap: 60, alignItems: 'center',
    padding: '70px 80px 40px', position: 'relative', zIndex: 2,
  },
  heroLeft: { paddingRight: 20 },
  kicker: {
    display: 'inline-flex', alignItems: 'center', gap: 8,
    fontFamily: '"Geist Mono", monospace',
    fontSize: 10.5, letterSpacing: 1.2, fontWeight: 500,
    color: '#555',
    background: 'rgba(10,10,10,0.04)',
    border: '1px solid rgba(10,10,10,0.06)',
    padding: '6px 10px', borderRadius: 999,
    marginBottom: 28,
  },
  kickerDot: {
    width: 6, height: 6, borderRadius: '50%',
    background: '#c6ff3a', boxShadow: '0 0 6px #c6ff3a',
  },
  h1: {
    fontSize: 72, fontWeight: 500, letterSpacing: -2.6, lineHeight: 0.98,
    margin: '0 0 24px', color: '#0a0a0a',
  },
  emItalic: {
    fontFamily: '"Instrument Serif", serif',
    fontStyle: 'italic',
    fontWeight: 400,
    letterSpacing: -1,
  },
  h1Accent: {
    position: 'relative',
    display: 'inline-block',
    paddingRight: 8,
  },
  sub: {
    fontSize: 17, lineHeight: 1.55, color: '#45443e',
    margin: '0 0 32px', maxWidth: 480,
    fontWeight: 400,
  },
  ctaRow: {
    display: 'flex', gap: 12, alignItems: 'center', marginBottom: 48,
  },
  cta: {
    background: '#0a0a0a', color: '#fff', border: 'none',
    borderRadius: 10, padding: '14px 22px',
    fontSize: 14.5, fontWeight: 500,
    cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 10,
    fontFamily: 'inherit',
    letterSpacing: -0.1,
    transition: 'transform 180ms, box-shadow 180ms',
  },
  ctaArrow: {
    transition: 'transform 240ms cubic-bezier(.3,.9,.4,1)',
    display: 'inline-block',
  },
  ctaSecondary: {
    background: 'transparent', color: '#0a0a0a',
    border: 'none',
    fontSize: 14, fontWeight: 500,
    cursor: 'pointer', fontFamily: 'inherit',
    padding: '14px 14px', textDecoration: 'underline',
    textDecorationColor: 'rgba(10,10,10,0.2)',
    textUnderlineOffset: 4,
  },
  metaRow: {
    display: 'flex', alignItems: 'center', gap: 20,
    paddingTop: 28,
    borderTop: '1px solid rgba(10,10,10,0.08)',
  },
  metaItem: { display: 'flex', flexDirection: 'column', gap: 2 },
  metaNum: {
    fontSize: 26, fontWeight: 500, letterSpacing: -1,
    fontFamily: '"Geist", sans-serif',
    color: '#0a0a0a',
  },
  metaLabel: {
    fontSize: 10.5, color: '#6a6a66', lineHeight: 1.25,
    fontFamily: '"Geist Mono", monospace',
    letterSpacing: 0.3, textTransform: 'uppercase',
  },
  metaDiv: {
    width: 1, height: 36, background: 'rgba(10,10,10,0.1)',
  },
  heroRight: {
    display: 'flex', justifyContent: 'center', alignItems: 'center',
    position: 'relative',
  },
  proof: {
    position: 'absolute', left: 80, right: 80, bottom: 96,
    display: 'flex', alignItems: 'center', gap: 28,
    zIndex: 2,
  },
  proofLabel: {
    fontFamily: '"Geist Mono", monospace',
    fontSize: 10, letterSpacing: 1.2, color: '#8a8a85',
    fontWeight: 500,
    whiteSpace: 'nowrap',
  },
  proofLogos: {
    display: 'flex', alignItems: 'center', gap: 18,
    flex: 1,
  },
  proofLogo: {
    fontSize: 15, fontWeight: 500, color: '#2a2a28',
    letterSpacing: -0.2, opacity: 0.72,
  },
  proofDot: { color: '#c0beb4', fontSize: 12 },
  helper: { position: 'absolute', left: 24, bottom: 24, zIndex: 3 },
  helperCircle: {
    width: 36, height: 36, borderRadius: '50%',
    background: '#0a0a0a', color: '#fff',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 13, fontWeight: 500,
    boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
    cursor: 'pointer',
  },
  footer: {
    position: 'absolute', left: 0, right: 0, bottom: 24,
    display: 'flex', justifyContent: 'space-between',
    padding: '0 32px', zIndex: 2,
  },
  footerLeft: {},
  footerMono: {
    fontFamily: '"Geist Mono", monospace',
    fontSize: 11, color: '#8a8a85', letterSpacing: 0.2,
  },
  footerRight: { display: 'flex', gap: 20 },
  footerLink: {
    fontSize: 12, color: '#6a6a66', cursor: 'pointer',
  },
};

const atsStyles = {
  card: {
    width: 440,
    background: '#fafaf6',
    borderRadius: 14,
    border: '1px solid rgba(10,10,10,0.08)',
    boxShadow: '0 1px 2px rgba(0,0,0,0.04), 0 24px 60px -20px rgba(10,10,10,0.18)',
    overflow: 'hidden',
  },
  chrome: {
    display: 'flex', alignItems: 'center', gap: 7,
    padding: '11px 14px',
    borderBottom: '1px solid rgba(10,10,10,0.06)',
    background: '#f0efe9',
    position: 'relative',
  },
  dot: { width: 11, height: 11, borderRadius: '50%' },
  chromeTitle: {
    position: 'absolute', left: 0, right: 0, textAlign: 'center',
    fontFamily: '"Geist Mono", monospace', fontSize: 11,
    color: '#7a7a74', fontWeight: 500, pointerEvents: 'none',
  },
  body: { padding: '22px 26px 26px' },
  bodyLabel: {
    display: 'inline-flex', alignItems: 'center', gap: 7,
    fontFamily: '"Geist Mono", monospace', fontSize: 10,
    letterSpacing: 1, color: '#555', marginBottom: 14,
    fontWeight: 500,
  },
  liveDot: {
    width: 6, height: 6, borderRadius: '50%',
    animation: 'pulse 1.4s infinite',
  },
  gaugeWrap: {
    position: 'relative', width: 180, height: 180,
    margin: '0 auto 20px',
  },
  gaugeCenter: {
    position: 'absolute', inset: 0,
    display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center',
  },
  gaugeNum: {
    fontSize: 54, fontWeight: 500, letterSpacing: -2.5,
    lineHeight: 1, color: '#0a0a0a',
    fontVariantNumeric: 'tabular-nums',
  },
  gaugeLabel: {
    fontFamily: '"Geist Mono", monospace',
    fontSize: 9.5, letterSpacing: 1.5, color: '#7a7a74',
    marginTop: 4,
  },
  kwLabel: {
    fontFamily: '"Geist Mono", monospace',
    fontSize: 10, letterSpacing: 0.8, color: '#7a7a74',
    marginBottom: 10, fontWeight: 500,
  },
  kwGrid: {
    display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6,
    marginBottom: 18,
  },
  kw: {
    fontFamily: '"Geist Mono", monospace',
    fontSize: 11, fontWeight: 500,
    padding: '6px 8px', borderRadius: 6,
    display: 'flex', alignItems: 'center', gap: 5,
  },
  kwHit: {
    background: 'rgba(198,255,58,0.25)',
    color: '#405410',
    border: '1px solid rgba(110,150,20,0.2)',
  },
  kwMiss: {
    background: 'rgba(10,10,10,0.04)',
    color: '#8a8a85',
    border: '1px solid rgba(10,10,10,0.06)',
  },
  progressRow: {
    borderTop: '1px solid rgba(10,10,10,0.06)', paddingTop: 14,
  },
  progressLabel: {
    display: 'flex', justifyContent: 'space-between',
    fontFamily: '"Geist Mono", monospace',
    fontSize: 11, color: '#3a3a38', marginBottom: 6,
    fontWeight: 500,
  },
  progressPct: { color: '#0a0a0a' },
  progressTrack: {
    height: 4, background: 'rgba(10,10,10,0.08)',
    borderRadius: 99, overflow: 'hidden',
  },
  progressBar: {
    height: '100%', background: '#0a0a0a',
    borderRadius: 99,
    transition: 'width 80ms linear',
  },
};

// inject pulse keyframes once
if (!document.getElementById('after-kf')) {
  const st = document.createElement('style');
  st.id = 'after-kf';
  st.textContent = `
    @keyframes pulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.55; transform: scale(0.9); }
    }
  `;
  document.head.appendChild(st);
}

window.LandingAfter = LandingAfter;
