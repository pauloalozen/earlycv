// ========== LOGIN AFTER ==========
// Vocabulário: painel split, kicker mono, detalhes técnicos,
// visual esquerdo conta história do produto.

function LoginAfter() {
  const s = loginAfterStyles;
  return (
    <div style={s.page}>
      {/* Grain */}
      <div style={s.grain} />

      {/* Panel esquerdo — "brand side" */}
      <div style={s.left}>
        <div style={s.leftNav}>
          <div style={s.logoWrap}>
            <div style={s.logoDot} />
            <div style={s.logoText}>earlyCV</div>
          </div>
          <div style={s.topMeta}>PT · BR</div>
        </div>

        <div style={s.leftBody}>
          <div style={s.kicker}>
            <span style={s.kickerDot} />
            ENTRAR
          </div>
          <div style={s.leftTitle}>
            Bem-vindo<br/>
            <em style={s.em}>de volta.</em>
          </div>
          <div style={s.leftSub}>
            Continue de onde parou. Seus CVs e vagas analisadas
            seguem esperando.
          </div>

          {/* mini "receipt" */}
          <div style={s.receipt}>
            <div style={s.receiptRow}>
              <span style={s.receiptK}>SESSÃO</span>
              <span style={s.receiptV}>encrypted · tls 1.3</span>
            </div>
            <div style={s.receiptRow}>
              <span style={s.receiptK}>LAST LOGIN</span>
              <span style={s.receiptV}>há 3 dias · São Paulo</span>
            </div>
            <div style={s.receiptRow}>
              <span style={s.receiptK}>CVs SALVOS</span>
              <span style={s.receiptV}>2 · última análise 87%</span>
            </div>
          </div>
        </div>

        <div style={s.leftFoot}>
          <span style={s.monoFoot}>© earlyCV · 2026</span>
          <span style={s.monoFoot}>v1.2 · status ● operational</span>
        </div>
      </div>

      {/* Panel direito — form */}
      <div style={s.right}>
        <div style={s.form}>
          <div style={s.formTitle}>Entrar na conta</div>
          <div style={s.formSub}>Use seu email ou continue com Google.</div>

          {/* Google pushado para cima */}
          <button style={s.google}>
            <GoogleG /> Continuar com Google
          </button>

          <div style={s.divider}>
            <div style={s.line} />
            <span style={s.orText}>OU COM EMAIL</span>
            <div style={s.line} />
          </div>

          <div style={s.field}>
            <div style={s.label}>Email</div>
            <div style={s.input}>
              <span style={s.inputPh}>seu@email.com</span>
            </div>
          </div>

          <div style={s.field}>
            <div style={s.labelRow}>
              <div style={s.label}>Senha</div>
              <a style={s.forgot}>Esqueci</a>
            </div>
            <div style={s.input}>
              <span style={s.inputPh}>••••••••</span>
              <span style={s.eyeIcon}>👁</span>
            </div>
          </div>

          <label style={s.checkRow}>
            <span style={s.check}><span style={s.checkMark} /></span>
            Manter conectado por 30 dias
          </label>

          <button style={s.cta}>
            Entrar
            <span style={s.ctaArrow}>→</span>
          </button>

          <div style={s.footerCta}>
            Não tem conta? <a style={s.footerLink}>Criar grátis →</a>
          </div>
        </div>
      </div>
    </div>
  );
}

function GoogleG() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18">
      <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"/>
      <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/>
      <path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"/>
      <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"/>
    </svg>
  );
}

const loginAfterStyles = {
  page: {
    width: 1440, height: 900,
    background: '#ecebe5',
    fontFamily: '"Geist", sans-serif',
    color: '#0a0a0a',
    display: 'grid', gridTemplateColumns: '1fr 1fr',
    position: 'relative',
  },
  grain: {
    position: 'absolute', inset: 0, pointerEvents: 'none', opacity: 0.4,
    backgroundImage: `url("data:image/svg+xml;utf8,<svg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.03 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>")`,
    mixBlendMode: 'multiply', zIndex: 1,
  },
  left: {
    background: '#0a0a0a', color: '#f0efe9',
    padding: '32px 56px',
    display: 'flex', flexDirection: 'column',
    position: 'relative', zIndex: 2,
  },
  leftNav: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  logoWrap: { display: 'flex', alignItems: 'center', gap: 10 },
  logoDot: {
    width: 18, height: 18, borderRadius: 5,
    background: '#fafaf6',
    boxShadow: 'inset -2px -2px 0 #c6ff3a',
  },
  logoText: {
    fontSize: 17, fontWeight: 600, letterSpacing: -0.4, color: '#fafaf6',
  },
  topMeta: {
    fontFamily: '"Geist Mono", monospace', fontSize: 10.5,
    letterSpacing: 1, color: '#8a8a85',
  },
  leftBody: { flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', maxWidth: 440 },
  kicker: {
    display: 'inline-flex', alignItems: 'center', gap: 8,
    fontFamily: '"Geist Mono", monospace',
    fontSize: 10.5, letterSpacing: 1.2, color: '#8a8a85',
    marginBottom: 22,
    width: 'fit-content',
  },
  kickerDot: {
    width: 6, height: 6, borderRadius: '50%', background: '#c6ff3a',
    boxShadow: '0 0 6px #c6ff3a',
  },
  leftTitle: {
    fontSize: 64, fontWeight: 500, letterSpacing: -2.5, lineHeight: 0.98,
    color: '#fafaf6', marginBottom: 22,
  },
  em: { fontFamily: '"Instrument Serif", serif', fontStyle: 'italic', fontWeight: 400 },
  leftSub: {
    fontSize: 15.5, lineHeight: 1.55, color: '#a8a8a0',
    marginBottom: 36,
  },
  receipt: {
    borderTop: '1px solid rgba(250,250,246,0.12)',
    paddingTop: 16,
  },
  receiptRow: {
    display: 'flex', justifyContent: 'space-between',
    fontFamily: '"Geist Mono", monospace', fontSize: 11,
    padding: '6px 0',
  },
  receiptK: { color: '#7a7a74', letterSpacing: 0.6 },
  receiptV: { color: '#d8d7cf' },
  leftFoot: {
    display: 'flex', justifyContent: 'space-between',
    fontFamily: '"Geist Mono", monospace', fontSize: 10.5,
    color: '#6a6a64', letterSpacing: 0.3,
  },
  monoFoot: {},
  right: {
    background: '#fafaf6',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    position: 'relative', zIndex: 2,
    padding: 40,
  },
  form: { width: 380 },
  formTitle: {
    fontSize: 28, fontWeight: 500, letterSpacing: -1, marginBottom: 6,
  },
  formSub: {
    fontSize: 14, color: '#6a6560', marginBottom: 28, lineHeight: 1.5,
  },
  google: {
    width: '100%', background: '#fff', border: '1px solid #d8d6ce',
    borderRadius: 10, padding: '12px', fontSize: 13.5, fontWeight: 500,
    cursor: 'pointer', fontFamily: 'inherit', color: '#0a0a0a',
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
    marginBottom: 22,
    transition: 'background 120ms',
  },
  divider: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 22 },
  line: { flex: 1, height: 1, background: '#d8d6ce' },
  orText: {
    fontFamily: '"Geist Mono", monospace', fontSize: 9.5,
    letterSpacing: 1.2, color: '#8a8a85', fontWeight: 500,
  },
  field: { marginBottom: 14 },
  label: {
    fontFamily: '"Geist Mono", monospace', fontSize: 10,
    letterSpacing: 1, color: '#6a6560', marginBottom: 7, fontWeight: 500,
  },
  labelRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' },
  forgot: {
    fontFamily: '"Geist Mono", monospace', fontSize: 10,
    color: '#0a0a0a', textDecoration: 'underline',
    textUnderlineOffset: 2, cursor: 'pointer',
  },
  input: {
    background: '#fff', border: '1px solid #d8d6ce', borderRadius: 8,
    padding: '11px 13px', fontSize: 13.5, display: 'flex', alignItems: 'center',
  },
  inputPh: { color: '#a8a6a0', flex: 1 },
  eyeIcon: { color: '#8a8a85', fontSize: 13 },
  checkRow: {
    display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer',
    fontSize: 12.5, color: '#45443e', marginTop: 4, marginBottom: 22,
  },
  check: {
    width: 16, height: 16, borderRadius: 4,
    background: '#0a0a0a',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  checkMark: {
    width: 8, height: 4, borderLeft: '1.5px solid #c6ff3a',
    borderBottom: '1.5px solid #c6ff3a', transform: 'rotate(-45deg) translate(1px, -1px)',
  },
  cta: {
    width: '100%', background: '#0a0a0a', color: '#fafaf6',
    border: 'none', borderRadius: 10, padding: '14px',
    fontSize: 14, fontWeight: 500,
    cursor: 'pointer', fontFamily: 'inherit',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 10,
    boxShadow: '0 4px 12px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.08)',
    marginBottom: 18,
  },
  ctaArrow: { fontSize: 14 },
  footerCta: {
    textAlign: 'center', fontSize: 13, color: '#6a6560',
  },
  footerLink: {
    color: '#0a0a0a', fontWeight: 500, textDecoration: 'underline',
    textUnderlineOffset: 3, cursor: 'pointer',
  },
};

window.LoginAfter = LoginAfter;
