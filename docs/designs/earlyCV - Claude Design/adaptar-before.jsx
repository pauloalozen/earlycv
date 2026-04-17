// ========== ADAPTAR BEFORE ==========
function AdaptarBefore() {
  const s = adaptarBeforeStyles;
  return (
    <div style={s.page}>
      <div style={s.nav}>
        <div style={s.logo}>earlyCV</div>
        <button style={s.navBtn}>👤 Entrar</button>
      </div>
      <div style={s.body}>
        <div style={s.title}>
          Cole a vaga e envie seu CV. A gente mostra por<br/>
          que você está sendo eliminado.
        </div>
        <div style={s.sub}>
          Leva menos de 30 segundos. Você verá os erros e um score do seu CV.
        </div>

        <div style={s.label}>Seu CV</div>
        <div style={s.upload}>
          <div style={s.uploadIcon}>↑</div>
          <div style={s.uploadTitle}>Arraste seu CV ou clique para enviar</div>
          <div style={s.uploadHint}>PDF, DOC ou DOCX — até 5 MB</div>
        </div>

        <div style={s.rowLabel}>
          <div style={s.label}>Cole aqui a descrição da vaga (LinkedIn, Gupy, etc.)</div>
          <div style={s.paste}>Colar exemplo</div>
        </div>
        <div style={s.textarea}>
          <div style={s.taPh}>Cole aqui o texto completo da vaga...</div>
          <div style={s.counter}>0/8000</div>
        </div>

        <button style={s.cta}>
          <span style={{ color: '#c6ff3a' }}>⚡</span> Analisar meu CV para essa vaga
        </button>
        <div style={s.footer}>
          Você verá exatamente o que está te eliminando e como corrigir.
        </div>
      </div>
    </div>
  );
}

const adaptarBeforeStyles = {
  page: {
    width: 1440, height: 900, background: '#f4f3f0',
    fontFamily: '"Geist", sans-serif', color: '#1a1a1a', position: 'relative',
  },
  nav: { display: 'flex', justifyContent: 'space-between', padding: '22px 40px' },
  logo: { fontSize: 19, fontWeight: 600, letterSpacing: -0.5 },
  navBtn: {
    background: '#fff', border: '1px solid #e5e3dc', borderRadius: 10,
    padding: '8px 16px', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
  },
  body: { maxWidth: 620, margin: '50px auto', padding: '0 40px' },
  title: {
    fontSize: 30, fontWeight: 600, letterSpacing: -0.8, lineHeight: 1.3,
    textAlign: 'center', marginBottom: 10,
  },
  sub: { fontSize: 13, color: '#888', textAlign: 'center', marginBottom: 36 },
  label: { fontSize: 12, fontWeight: 600, marginBottom: 8 },
  rowLabel: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' },
  paste: { fontSize: 12, color: '#666', fontWeight: 500 },
  upload: {
    background: '#fff', border: '1px dashed #e5e3dc', borderRadius: 14,
    padding: '34px 20px', textAlign: 'center', marginBottom: 22,
  },
  uploadIcon: { fontSize: 18, marginBottom: 8 },
  uploadTitle: { fontSize: 13, fontWeight: 600, marginBottom: 4 },
  uploadHint: { fontSize: 11, color: '#aaa' },
  textarea: {
    background: '#fff', border: '1px solid #ebeae4', borderRadius: 14,
    padding: '14px 16px', minHeight: 140, marginBottom: 8,
    position: 'relative',
  },
  taPh: { fontSize: 13, color: '#aaa' },
  counter: {
    position: 'absolute', right: 14, bottom: 10,
    fontSize: 11, color: '#bbb',
  },
  cta: {
    width: '100%', background: '#0f0f0f', color: '#fff',
    border: 'none', borderRadius: 12, padding: '14px',
    fontSize: 14, fontWeight: 500, cursor: 'pointer',
    fontFamily: 'inherit', marginTop: 22, marginBottom: 14,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  footer: { fontSize: 12, color: '#999', textAlign: 'center' },
};

window.AdaptarBefore = AdaptarBefore;
