// ========== CONTATO ==========
function Contato() {
  const s = contatoStyles;
  const [copied, setCopied] = React.useState(false);
  return (
    <div style={s.page}>
      <div style={s.grain} />
      {/* mini nav */}
      <div style={s.nav}>
        <div style={s.logoWrap}>
          <div style={s.logoDot} />
          <div style={s.logo}>earlyCV</div>
          <div style={s.logoVer}>v1.2</div>
        </div>
      </div>

      <div style={s.center}>
        <div style={s.card}>
          <div style={s.kicker}>
            <span style={s.kickerDot} />
            FALE CONOSCO
          </div>
          <h1 style={s.h1}>
            Tem alguma dúvida<br/>ou <em style={s.em}>sugestão?</em>
          </h1>
          <p style={s.body}>
            Encontrou algum problema, quer compartilhar uma ideia ou
            só tem uma dúvida? A equipe do EarlyCV lê todas as
            mensagens e responde o mais rápido possível.
          </p>

          <div style={s.emailRow}>
            <div style={s.emailChip}>
              <span style={s.emailIcon}>@</span>
              <span style={s.emailText}>contato@earlycv.com.br</span>
            </div>
            <button
              style={{ ...s.copyBtn, background: copied ? '#c6ff3a' : '#0a0a0a', color: copied ? '#0a0a0a' : '#fff' }}
              onClick={() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }}
            >
              {copied ? '✓ Copiado' : '⧉ Copiar'}
            </button>
          </div>

          <div style={s.divider} />

          <a style={s.backLink}>← Voltar para o início</a>
        </div>

        {/* Trust strip */}
        <div style={s.trust}>
          <span style={s.trustItem}>
            <span style={s.trustDot} />
            Respondemos em até 24h
          </span>
          <span style={s.trustSep}>·</span>
          <span style={s.trustItem}>
            <span style={s.trustDot} />
            Toda mensagem é lida
          </span>
        </div>
      </div>

      <div style={s.footer}>
        <span style={s.footerMono}>© earlyCV · 2026</span>
      </div>
    </div>
  );
}

const contatoStyles = {
  page: {
    width: 1440, height: 900,
    background: 'radial-gradient(ellipse 80% 60% at 50% 0%, #f9f8f4 0%, #ecebe5 100%)',
    fontFamily: '"Geist", sans-serif', color: '#0a0a0a',
    position: 'relative', display: 'flex', flexDirection: 'column',
    alignItems: 'center',
  },
  grain: {
    position: 'absolute', inset: 0, pointerEvents: 'none', opacity: 0.5,
    backgroundImage: `url("data:image/svg+xml;utf8,<svg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.035 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>")`,
    mixBlendMode: 'multiply',
  },
  nav: {
    width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center',
    padding: '24px 40px', position: 'relative', zIndex: 2,
  },
  logoWrap: { display: 'flex', alignItems: 'center', gap: 10 },
  logoDot: { width: 18, height: 18, borderRadius: 5, background: '#0a0a0a', boxShadow: 'inset -2px -2px 0 rgba(198,255,58,0.85)' },
  logo: { fontSize: 17, fontWeight: 600, letterSpacing: -0.4 },
  logoVer: { fontFamily: '"Geist Mono", monospace', fontSize: 10, color: '#8a8a85', border: '1px solid #d8d6ce', borderRadius: 3, padding: '1px 5px', fontWeight: 500 },
  center: {
    flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
    justifyContent: 'center', position: 'relative', zIndex: 2, padding: '0 40px',
  },
  card: {
    background: '#fafaf6', border: '1px solid rgba(10,10,10,0.08)',
    borderRadius: 20, padding: '40px 44px',
    width: 540,
    boxShadow: '0 1px 2px rgba(0,0,0,0.03), 0 16px 40px -16px rgba(10,10,10,0.12)',
  },
  kicker: {
    display: 'inline-flex', alignItems: 'center', gap: 8,
    fontFamily: '"Geist Mono", monospace', fontSize: 10.5, letterSpacing: 1.2,
    fontWeight: 500, color: '#555',
    background: 'rgba(10,10,10,0.04)', border: '1px solid rgba(10,10,10,0.06)',
    padding: '6px 10px', borderRadius: 999, marginBottom: 20,
  },
  kickerDot: { width: 6, height: 6, borderRadius: '50%', background: '#c6ff3a', boxShadow: '0 0 6px #c6ff3a' },
  h1: { fontSize: 36, fontWeight: 500, letterSpacing: -1.4, lineHeight: 1.08, margin: '0 0 16px' },
  em: { fontFamily: '"Instrument Serif", serif', fontStyle: 'italic', fontWeight: 400 },
  body: { fontSize: 15, color: '#45443e', lineHeight: 1.6, margin: '0 0 28px' },
  emailRow: { display: 'flex', gap: 10, alignItems: 'center', marginBottom: 28 },
  emailChip: {
    flex: 1, display: 'flex', alignItems: 'center', gap: 10,
    background: '#fff', border: '1px solid rgba(10,10,10,0.1)',
    borderRadius: 10, padding: '12px 14px',
  },
  emailIcon: { fontFamily: '"Geist Mono", monospace', fontSize: 13, color: '#8a8a85', fontWeight: 500 },
  emailText: { fontFamily: '"Geist Mono", monospace', fontSize: 13, color: '#0a0a0a', fontWeight: 500 },
  copyBtn: {
    border: 'none', borderRadius: 10, padding: '12px 16px',
    fontSize: 13, fontWeight: 500, cursor: 'pointer',
    fontFamily: 'inherit', transition: 'background 200ms, color 200ms',
    whiteSpace: 'nowrap',
    boxShadow: '0 4px 12px rgba(0,0,0,0.1), inset 0 1px 0 rgba(255,255,255,0.08)',
  },
  divider: { height: 1, background: 'rgba(10,10,10,0.06)', marginBottom: 20 },
  backLink: {
    fontFamily: '"Geist Mono", monospace', fontSize: 11.5,
    color: '#6a6560', cursor: 'pointer', letterSpacing: 0.2,
    textDecoration: 'underline', textUnderlineOffset: 3,
  },
  trust: { display: 'flex', alignItems: 'center', gap: 14, marginTop: 18 },
  trustItem: {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    fontFamily: '"Geist Mono", monospace', fontSize: 10.5,
    color: '#6a6560', letterSpacing: 0.2,
  },
  trustDot: { width: 5, height: 5, borderRadius: '50%', background: '#c6ff3a' },
  trustSep: { color: '#c0beb4' },
  footer: {
    position: 'absolute', bottom: 24, left: 0, right: 0, textAlign: 'center',
    zIndex: 2,
  },
  footerMono: { fontFamily: '"Geist Mono", monospace', fontSize: 11, color: '#8a8a85' },
};

window.Contato = Contato;
