// ========== LOGIN BEFORE ==========
function LoginBefore() {
  const s = loginBeforeStyles;
  return (
    <div style={s.page}>
      <div style={s.center}>
        <div style={s.logo}>earlyCV</div>
        <div style={s.pill}>
          <span style={s.dot} />
          +Identifica gaps que passam batido por recrutadores
        </div>
        <div style={s.card}>
          <div style={s.title}>Bem-vindo de volta</div>
          <div style={s.sub}>Entre para acessar sua conta</div>

          <div style={s.label}>Email</div>
          <div style={s.input}>seu@email.com</div>

          <div style={s.rowLabel}>
            <div style={s.label}>Senha</div>
            <div style={s.forgot}>Esqueceu sua senha?</div>
          </div>
          <div style={s.input}>
            Sua senha
            <span style={{ marginLeft: 'auto' }}>👁</span>
          </div>

          <button style={s.cta}>Entrar</button>

          <div style={s.divider}>
            <div style={s.line} /><span style={s.orText}>ou continue com</span><div style={s.line} />
          </div>

          <button style={s.google}>
            <span style={{ fontWeight: 700, color: '#4285F4' }}>G</span> Continuar com Google
          </button>

          <div style={s.footerCta}>
            Não tem conta? <strong>Criar grátis</strong>
          </div>
        </div>
      </div>
    </div>
  );
}

const loginBeforeStyles = {
  page: {
    width: 1440, height: 900,
    background: '#f4f3f0',
    fontFamily: '"Geist", sans-serif',
    color: '#1a1a1a', position: 'relative',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  center: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    width: 420,
  },
  logo: {
    fontSize: 28, fontWeight: 600, letterSpacing: -0.5, marginBottom: 22,
  },
  pill: {
    background: '#0f0f0f', color: '#fff',
    borderRadius: 999, padding: '7px 14px',
    fontSize: 12, fontWeight: 500,
    display: 'inline-flex', alignItems: 'center', gap: 8,
    marginBottom: 28,
  },
  dot: { width: 7, height: 7, borderRadius: '50%', background: '#c6ff3a' },
  card: {
    width: '100%', background: '#fff',
    borderRadius: 14, padding: '30px 34px 28px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
  },
  title: { fontSize: 20, fontWeight: 600, textAlign: 'center', marginBottom: 6 },
  sub: { fontSize: 13, color: '#888', textAlign: 'center', marginBottom: 22 },
  label: { fontSize: 12, fontWeight: 600, marginBottom: 6 },
  rowLabel: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  forgot: { fontSize: 11, color: '#666' },
  input: {
    background: '#f5f5f2', border: '1px solid #ebeae4', borderRadius: 10,
    padding: '11px 14px', fontSize: 13, color: '#aaa', marginBottom: 14,
    display: 'flex', alignItems: 'center',
  },
  cta: {
    width: '100%', background: '#0f0f0f', color: '#fff',
    border: 'none', borderRadius: 10, padding: '13px', fontSize: 13.5,
    fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit',
    marginTop: 4, marginBottom: 18,
  },
  divider: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 },
  line: { flex: 1, height: 1, background: '#eee' },
  orText: { fontSize: 11, color: '#999' },
  google: {
    width: '100%', background: '#fff', border: '1px solid #e5e3dc',
    borderRadius: 10, padding: '11px', fontSize: 13, fontWeight: 500,
    cursor: 'pointer', fontFamily: 'inherit',
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  footerCta: {
    textAlign: 'center', fontSize: 12, color: '#888', marginTop: 16,
  },
};

window.LoginBefore = LoginBefore;
