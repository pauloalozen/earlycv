// ========== ADAPTAR AFTER ==========
// Layout 2 colunas: formulário focado à esquerda, preview/status à direita.
// Mantém a mesma linguagem (kicker mono, Instrument Serif, grain, micro-detalhes).

function AdaptarAfter() {
  const s = adaptarAfterStyles;
  const [fileHover, setFileHover] = React.useState(false);
  const [jobText, setJobText] = React.useState('');

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
          <div style={s.breadcrumb}>
            <span style={s.crumbMuted}>Início</span>
            <span style={s.crumbSep}>/</span>
            <span>Adaptar</span>
          </div>
          <button style={s.navBtn}>Entrar</button>
        </div>
      </div>

      <div style={s.main}>
        {/* Header */}
        <div style={s.header}>
          <div style={s.kicker}>
            <span style={s.kickerDot} />
            <span>ANÁLISE · 30 SEGUNDOS</span>
          </div>
          <h1 style={s.h1}>
            Cole a vaga, envie seu CV.<br/>
            A gente mostra <em style={s.em}>exatamente</em><br/>
            por que você é eliminado.
          </h1>
        </div>

        {/* 2-col */}
        <div style={s.grid}>
          <div style={s.col}>
            {/* Step 01 */}
            <div style={s.step}>
              <div style={s.stepHead}>
                <div style={s.stepNum}>01</div>
                <div>
                  <div style={s.stepTitle}>Seu CV</div>
                  <div style={s.stepSub}>PDF, DOC ou DOCX · até 5 MB</div>
                </div>
              </div>
              <div
                style={{
                  ...s.upload,
                  borderColor: fileHover ? '#0a0a0a' : '#d0ceC6',
                  background: fileHover ? '#f5f4ee' : '#fafaf6',
                }}
                onMouseEnter={() => setFileHover(true)}
                onMouseLeave={() => setFileHover(false)}
              >
                <div style={s.uploadIcon}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                    <path d="M12 4v12m0-12l-4 4m4-4l4 4M4 20h16" stroke="#0a0a0a" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                <div style={s.uploadTitle}>Arraste ou clique para enviar</div>
                <div style={s.uploadHint}>seu-cv.pdf · ou solte aqui</div>
              </div>
            </div>

            {/* Step 02 */}
            <div style={s.step}>
              <div style={s.stepHead}>
                <div style={s.stepNum}>02</div>
                <div style={{ flex: 1 }}>
                  <div style={s.stepTitle}>Descrição da vaga</div>
                  <div style={s.stepSub}>LinkedIn, Gupy, Infojobs, etc.</div>
                </div>
                <a style={s.pasteExample}>colar exemplo</a>
              </div>
              <div style={s.taWrap}>
                <textarea
                  style={s.ta}
                  placeholder="Cole aqui o texto completo da vaga..."
                  value={jobText}
                  onChange={e => setJobText(e.target.value.slice(0, 8000))}
                />
                <div style={s.taMeta}>
                  <span style={s.taChars}>{jobText.length} / 8000</span>
                  <span style={s.taHint}>⌘+V para colar</span>
                </div>
              </div>
            </div>

            <button style={s.cta}>
              <span>Analisar CV para essa vaga</span>
              <span style={s.ctaArrow}>→</span>
            </button>
            <div style={s.ctaHint}>
              Grátis · sem cadastro obrigatório · resultado em segundos
            </div>
          </div>

          {/* Right column — o que você vai receber */}
          <div style={s.sideCol}>
            <div style={s.sideLabel}>O QUE VOCÊ VAI RECEBER</div>
            <div style={s.sideCard}>
              <div style={s.sideHead}>
                <div style={{ ...s.sideHeadDot, background: '#c6ff3a' }} />
                <span>RELATÓRIO PRÉVIA</span>
              </div>

              <div style={s.previewTitle}>Relatório de alinhamento</div>

              <div style={s.metricRow}>
                <span style={s.metricK}>ATS SCORE</span>
                <span style={s.metricV}>0–100</span>
              </div>
              <div style={s.metricRow}>
                <span style={s.metricK}>KEYWORDS</span>
                <span style={s.metricV}>presentes · ausentes</span>
              </div>
              <div style={s.metricRow}>
                <span style={s.metricK}>VERBOS DE AÇÃO</span>
                <span style={s.metricV}>mapeados da vaga</span>
              </div>
              <div style={s.metricRow}>
                <span style={s.metricK}>FORMATAÇÃO</span>
                <span style={s.metricV}>problemas estruturais</span>
              </div>
              <div style={s.metricRow}>
                <span style={s.metricK}>SUGESTÕES</span>
                <span style={s.metricV}>por seção</span>
              </div>

              <div style={s.sideFooter}>
                <span style={s.sideFooterMono}>
                  Priv: seus dados não são usados para treinar modelos.
                </span>
              </div>
            </div>

            <div style={s.trustRow}>
              <TrustBadge k="⚡" v="30s" label="tempo médio" />
              <TrustBadge k="🔒" v="e2e" label="criptografia" />
              <TrustBadge k="✓" v="12k+" label="análises" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function TrustBadge({ k, v, label }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 2,
      padding: '10px 12px', background: 'rgba(10,10,10,0.03)',
      border: '1px solid rgba(10,10,10,0.06)', borderRadius: 8,
      flex: 1,
    }}>
      <div style={{
        fontFamily: '"Geist Mono", monospace', fontSize: 10,
        color: '#8a8a85', letterSpacing: 0.5,
      }}>{label.toUpperCase()}</div>
      <div style={{
        fontSize: 18, fontWeight: 500, letterSpacing: -0.5,
      }}>{v}</div>
    </div>
  );
}

const adaptarAfterStyles = {
  page: {
    width: 1440, height: 900,
    background: 'radial-gradient(ellipse 80% 60% at 50% 0%, #f9f8f4 0%, #ecebe5 100%)',
    fontFamily: '"Geist", sans-serif', color: '#0a0a0a', position: 'relative',
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
    width: 18, height: 18, borderRadius: 5, background: '#0a0a0a',
    boxShadow: 'inset -2px -2px 0 rgba(198,255,58,0.85)',
  },
  logo: { fontSize: 17, fontWeight: 600, letterSpacing: -0.4 },
  logoVer: {
    fontFamily: '"Geist Mono", monospace', fontSize: 10, color: '#8a8a85',
    border: '1px solid #d8d6ce', borderRadius: 3, padding: '1px 5px', fontWeight: 500,
  },
  navRight: { display: 'flex', alignItems: 'center', gap: 24 },
  breadcrumb: {
    fontFamily: '"Geist Mono", monospace', fontSize: 11,
    letterSpacing: 0.4, color: '#0a0a0a',
    display: 'flex', gap: 7,
  },
  crumbMuted: { color: '#8a8a85' },
  crumbSep: { color: '#c0beb4' },
  navBtn: {
    background: 'transparent', border: 'none',
    fontSize: 13, fontWeight: 500, cursor: 'pointer',
    padding: '8px 4px', fontFamily: 'inherit',
  },
  main: { padding: '48px 80px 40px', position: 'relative', zIndex: 2, maxWidth: 1440, margin: '0 auto' },
  header: { maxWidth: 780, marginBottom: 44 },
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
    fontSize: 52, fontWeight: 500, letterSpacing: -2, lineHeight: 1.02,
    margin: 0,
  },
  em: { fontFamily: '"Instrument Serif", serif', fontStyle: 'italic', fontWeight: 400 },
  grid: { display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: 40, alignItems: 'start' },
  col: {},
  step: { marginBottom: 22 },
  stepHead: {
    display: 'flex', alignItems: 'center', gap: 14, marginBottom: 12,
  },
  stepNum: {
    fontFamily: '"Geist Mono", monospace', fontSize: 13, fontWeight: 500,
    color: '#0a0a0a',
    width: 32, height: 32, borderRadius: 8,
    background: '#0a0a0a', color: '#fafaf6',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  stepTitle: { fontSize: 15, fontWeight: 500, letterSpacing: -0.2 },
  stepSub: {
    fontFamily: '"Geist Mono", monospace', fontSize: 10.5,
    color: '#7a7a74', letterSpacing: 0.3,
  },
  pasteExample: {
    fontFamily: '"Geist Mono", monospace', fontSize: 10.5,
    color: '#0a0a0a', textDecoration: 'underline',
    textUnderlineOffset: 2, cursor: 'pointer', letterSpacing: 0.3,
  },
  upload: {
    border: '1.5px dashed #d0ceC6', borderRadius: 14,
    padding: '44px 20px', textAlign: 'center',
    transition: 'border-color 120ms, background 120ms',
    cursor: 'pointer',
  },
  uploadIcon: { marginBottom: 10, display: 'flex', justifyContent: 'center' },
  uploadTitle: { fontSize: 14, fontWeight: 500, marginBottom: 4 },
  uploadHint: {
    fontFamily: '"Geist Mono", monospace', fontSize: 11,
    color: '#8a8a85',
  },
  taWrap: {
    background: '#fafaf6', border: '1px solid #d8d6ce', borderRadius: 12,
    padding: '12px 14px',
  },
  ta: {
    width: '100%', border: 'none', outline: 'none',
    fontFamily: '"Geist", sans-serif', fontSize: 13.5,
    background: 'transparent', color: '#0a0a0a',
    minHeight: 120, resize: 'vertical',
    lineHeight: 1.55,
  },
  taMeta: {
    display: 'flex', justifyContent: 'space-between',
    borderTop: '1px solid rgba(10,10,10,0.06)',
    paddingTop: 8, marginTop: 6,
  },
  taChars: {
    fontFamily: '"Geist Mono", monospace', fontSize: 10.5,
    color: '#8a8a85',
  },
  taHint: {
    fontFamily: '"Geist Mono", monospace', fontSize: 10.5,
    color: '#8a8a85',
  },
  cta: {
    width: '100%', background: '#0a0a0a', color: '#fafaf6',
    border: 'none', borderRadius: 12, padding: '15px',
    fontSize: 15, fontWeight: 500, cursor: 'pointer',
    fontFamily: 'inherit', marginTop: 14,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 10,
    boxShadow: '0 4px 12px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.08)',
    letterSpacing: -0.1,
  },
  ctaArrow: {},
  ctaHint: {
    fontFamily: '"Geist Mono", monospace', fontSize: 10.5,
    color: '#8a8a85', textAlign: 'center', marginTop: 10,
    letterSpacing: 0.3,
  },
  sideCol: { display: 'flex', flexDirection: 'column', gap: 14 },
  sideLabel: {
    fontFamily: '"Geist Mono", monospace', fontSize: 10,
    letterSpacing: 1.2, color: '#8a8a85', fontWeight: 500,
  },
  sideCard: {
    background: '#0a0a0a', color: '#f0efe9', borderRadius: 14,
    padding: '20px 22px',
  },
  sideHead: {
    display: 'flex', alignItems: 'center', gap: 8,
    fontFamily: '"Geist Mono", monospace', fontSize: 10,
    letterSpacing: 1.2, color: '#a0a098', marginBottom: 14, fontWeight: 500,
  },
  sideHeadDot: { width: 6, height: 6, borderRadius: '50%' },
  previewTitle: {
    fontSize: 18, fontWeight: 500, letterSpacing: -0.4,
    color: '#fafaf6', marginBottom: 16,
  },
  metricRow: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
    padding: '9px 0', borderTop: '1px solid rgba(250,250,246,0.08)',
  },
  metricK: {
    fontFamily: '"Geist Mono", monospace', fontSize: 10.5,
    color: '#a0a098', letterSpacing: 0.5,
  },
  metricV: {
    fontSize: 13, color: '#e8e7df',
  },
  sideFooter: {
    marginTop: 14, paddingTop: 12,
    borderTop: '1px solid rgba(250,250,246,0.08)',
  },
  sideFooterMono: {
    fontFamily: '"Geist Mono", monospace', fontSize: 10.5,
    color: '#7a7a74', letterSpacing: 0.2, lineHeight: 1.5,
  },
  trustRow: { display: 'flex', gap: 8 },
};

window.AdaptarAfter = AdaptarAfter;
