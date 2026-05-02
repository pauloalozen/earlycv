// ========== PAGAMENTO PENDENTE ==========
function PagamentoPendente() {
  const s = pagStyles;
  return (
    <div style={s.page}>
      <Grain />
      <div style={s.nav}>
        <LogoLockup />
      </div>
      <div style={s.center}>
        <div style={s.card}>
          <div style={s.iconWrap}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="#f5c518" strokeWidth="1.5"/>
              <path d="M12 7v5l3 3" stroke="#f5c518" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <div style={s.title}>Pagamento pendente</div>
          <div style={s.body}>
            Seu pagamento está aguardando confirmação. Assim que aprovado, seus créditos serão liberados automaticamente.
          </div>
          <div style={s.body}>
            Pagamento pendente. Se você ainda não concluiu o Pix, pode abrir o pagamento novamente.
          </div>
          <div style={s.hint}>
            Para pagamentos via PIX ou boleto, isso pode levar alguns minutos.
          </div>
          <div style={s.dots}>
            <span style={{...s.dot, background: '#f5c518'}} />
            <span style={{...s.dot, background: '#f5c518', opacity: 0.5}} />
            <span style={{...s.dot, background: '#f5c518', opacity: 0.25}} />
          </div>
          <button style={s.ctaPrimary}>Abrir Pix novamente</button>
          <button style={s.ctaGhost}>Voltar para minhas compras</button>
        </div>
      </div>
      <div style={s.footer}>
        <span style={s.footerMono}>© EarlyCV · 2026</span>
      </div>
    </div>
  );
}

// ========== PAGAMENTO CONFIRMADO ==========
function PagamentoConfirmado() {
  const s = pagStyles;
  return (
    <div style={s.page}>
      <Grain />
      <div style={s.nav}>
        <LogoLockup />
      </div>
      <div style={s.center}>
        <div style={s.card}>
          <div style={{...s.iconWrap, background: 'rgba(198,255,58,0.18)', border: '1px solid rgba(110,150,20,0.2)'}}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <path d="M5 12l5 5L20 7" stroke="#405410" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <div style={s.title}>Pagamento confirmado!</div>
          <div style={{...s.body, color: '#45443e'}}>
            Seus créditos já estão disponíveis e seu CV já está liberado.
          </div>
          <div style={s.divider} />
          <button style={s.ctaPrimary}>Baixar PDF</button>
          <button style={{...s.ctaSecondary}}>Baixar DOCX</button>
          <button style={s.ctaGhost}>Voltar para análise e baixar depois</button>
        </div>
      </div>
      <div style={s.footer}>
        <span style={s.footerMono}>© EarlyCV · 2026</span>
      </div>
    </div>
  );
}

const pagStyles = {
  page: {
    width: 1440, height: 900,
    background: 'radial-gradient(ellipse 80% 60% at 50% 0%, #f9f8f4 0%, #ecebe5 100%)',
    fontFamily: "'Geist', sans-serif", color: '#0a0a0a',
    position: 'relative', display: 'flex', flexDirection: 'column',
    alignItems: 'center',
  },
  nav: {
    width: '100%', display: 'flex', justifyContent: 'center',
    padding: '24px 40px', borderBottom: '1px solid rgba(0,0,0,0.04)',
    position: 'relative', zIndex: 2,
  },
  center: {
    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
    position: 'relative', zIndex: 2, padding: '40px',
  },
  card: {
    background: '#fafaf6', border: '1px solid rgba(10,10,10,0.08)',
    borderRadius: 18, padding: '40px 44px',
    width: 460, textAlign: 'center',
    boxShadow: '0 1px 2px rgba(0,0,0,0.03), 0 16px 40px -16px rgba(10,10,10,0.1)',
    display: 'flex', flexDirection: 'column', alignItems: 'center',
  },
  iconWrap: {
    width: 56, height: 56, borderRadius: '50%',
    background: 'rgba(245,197,24,0.12)',
    border: '1px solid rgba(245,197,24,0.25)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 24, fontWeight: 500, letterSpacing: -0.8,
    marginBottom: 12, color: '#0a0a0a',
  },
  body: {
    fontSize: 14, color: '#5a5a55', lineHeight: 1.6,
    marginBottom: 8, maxWidth: 340,
  },
  hint: {
    fontFamily: "'Geist Mono', monospace", fontSize: 11,
    color: '#a0a098', letterSpacing: 0.2, marginBottom: 20,
    lineHeight: 1.5, maxWidth: 320,
  },
  dots: {
    display: 'flex', gap: 6, marginBottom: 28,
  },
  dot: {
    width: 7, height: 7, borderRadius: '50%',
  },
  divider: {
    width: '100%', height: 1, background: 'rgba(10,10,10,0.06)',
    margin: '20px 0',
  },
  ctaPrimary: {
    width: '100%', background: '#0a0a0a', color: '#fafaf6',
    border: 'none', borderRadius: 10, padding: '14px',
    fontSize: 14.5, fontWeight: 500, cursor: 'pointer',
    fontFamily: 'inherit', marginBottom: 10,
    boxShadow: '0 4px 12px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.08)',
  },
  ctaSecondary: {
    width: '100%', background: '#fff', color: '#0a0a0a',
    border: '1px solid rgba(10,10,10,0.15)', borderRadius: 10, padding: '13px',
    fontSize: 14.5, fontWeight: 500, cursor: 'pointer',
    fontFamily: 'inherit', marginBottom: 10,
  },
  ctaGhost: {
    background: 'transparent', border: 'none',
    color: '#6a6560', fontSize: 13, cursor: 'pointer',
    fontFamily: 'inherit', padding: '8px',
    textDecoration: 'underline', textUnderlineOffset: 3,
    textDecorationColor: 'rgba(10,10,10,0.2)',
  },
  footer: {
    position: 'absolute', bottom: 24, left: 0, right: 0, textAlign: 'center',
    zIndex: 2,
  },
  footerMono: {
    fontFamily: "'Geist Mono', monospace", fontSize: 11, color: '#8a8a85',
  },
};

window.PagamentoPendente = PagamentoPendente;
window.PagamentoConfirmado = PagamentoConfirmado;
