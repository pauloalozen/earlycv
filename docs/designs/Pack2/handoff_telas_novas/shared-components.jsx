// ========== SHARED LOGO ICON (refined D) ==========
function LogoIcon({ size = 20, dark = false }) {
  const f = dark ? 'rgba(250,250,246,0.4)' : 'rgba(10,10,10,0.45)';
  const d = dark ? 'rgba(250,250,246,0.12)' : 'rgba(10,10,10,0.18)';
  return (
    <svg width={size} height={Math.round(size * 0.8)} viewBox="0 0 40 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="0"  y="0"  width="13" height="4" rx="1.5" fill={f}/>
      <rect x="17" y="0"  width="10" height="4" rx="1.5" fill={f}/>
      <rect x="31" y="0"  width="9"  height="4" rx="1.5" fill="#c6ff3a"/>
      <rect x="0"  y="14" width="15" height="4" rx="1.5" fill="#c6ff3a"/>
      <rect x="19" y="14" width="21" height="4" rx="1.5" fill={f}/>
      <rect x="0"  y="28" width="8"  height="4" rx="1.5" fill={f}/>
      <rect x="12" y="28" width="15" height="4" rx="1.5" fill="#c6ff3a"/>
      <rect x="31" y="28" width="9"  height="4" rx="1.5" fill={d}/>
    </svg>
  );
}

function LogoLockup({ dark = false, size = 17 }) {
  const col = dark ? '#fafaf6' : '#0a0a0a';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <LogoIcon size={size + 3} dark={dark} />
      <div style={{ display: 'flex', alignItems: 'baseline' }}>
        <span style={{ fontSize: size, fontWeight: 300, letterSpacing: '-0.5px', fontFamily: "'Geist', sans-serif", color: col, lineHeight: 1 }}>early</span>
        <span style={{ fontSize: size, fontWeight: 700, letterSpacing: '-0.5px', fontFamily: "'Geist', sans-serif", color: col, lineHeight: 1 }}>CV</span>
      </div>
      <span style={{ fontFamily: "'Geist Mono', monospace", fontSize: 10, color: dark ? '#5a5a54' : '#8a8a85', border: `1px solid ${dark ? 'rgba(250,250,246,0.12)' : '#d8d6ce'}`, borderRadius: 3, padding: '1px 5px', fontWeight: 500 }}>v1.2</span>
    </div>
  );
}

// shared grain
function Grain() {
  return (
    <div style={{
      position: 'absolute', inset: 0, pointerEvents: 'none', opacity: 0.5,
      backgroundImage: `url("data:image/svg+xml;utf8,<svg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.035 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>")`,
      mixBlendMode: 'multiply',
    }} />
  );
}

// shared nav
function NavBar({ dark = false }) {
  const bg = dark ? '#0a0a0a' : 'transparent';
  const border = dark ? '1px solid rgba(250,250,246,0.06)' : '1px solid rgba(0,0,0,0.04)';
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px 40px', borderBottom: border, background: bg, position: 'relative', zIndex: 2 }}>
      <LogoLockup dark={dark} />
      <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
        <span style={{ fontSize: 13, color: dark ? '#a0a098' : '#3a3a38', fontWeight: 400, cursor: 'pointer' }}>Blog</span>
        <span style={{ fontSize: 13, color: dark ? '#a0a098' : '#3a3a38', fontWeight: 400, cursor: 'pointer' }}>Como funciona</span>
        <button style={{ background: dark ? '#fafaf6' : '#0a0a0a', color: dark ? '#0a0a0a' : '#fff', border: 'none', borderRadius: 8, padding: '8px 14px', fontSize: 12.5, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}>Adaptar meu CV →</button>
      </div>
    </div>
  );
}

// shared CTA block
function CtaBlock({ title = 'Compare seu CV com a vaga em minutos', sub = 'Veja lacunas, pontos fortes e ajustes possíveis sem inventar informações.', kicker = 'ANÁLISE GRATUITA' }) {
  return (
    <div style={{ background: '#0a0a0a', borderRadius: 14, padding: '28px 32px', margin: '48px 0' }}>
      <div style={{ fontFamily: "'Geist Mono', monospace", fontSize: 10, letterSpacing: 1.2, color: '#7a7a74', marginBottom: 12, fontWeight: 500 }}>{kicker}</div>
      <div style={{ fontSize: 22, fontWeight: 500, color: '#fafaf6', letterSpacing: -0.8, marginBottom: 8 }}>{title}</div>
      <div style={{ fontSize: 14, color: '#a0a098', marginBottom: 20, lineHeight: 1.5 }}>{sub}</div>
      <button style={{ background: '#c6ff3a', color: '#0a0a0a', border: 'none', borderRadius: 8, padding: '11px 18px', fontSize: 13.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Adaptar meu CV →</button>
    </div>
  );
}

// shared footer
function SiteFooter() {
  const s = footerStyles;
  const cols = [
    { label: 'PRODUTO', links: ['Análise gratuita', 'Adaptar currículo', 'Currículo ATS', 'Palavras-chave'] },
    { label: 'APRENDER', links: ['Blog', 'Como adaptar currículo', 'Currículo ATS (artigo)', 'Palavras-chave (artigo)'] },
    { label: 'RECURSOS', links: ['Modelo de currículo ATS', 'Currículo para Gupy', 'Contato', 'Demo de resultado'] },
    { label: 'LEGAL', links: ['Privacidade', 'Termos de uso'] },
  ];
  return (
    <div style={s.footer}>
      <Grain />
      {/* CTA strip */}
      <div style={s.ctaStrip}>
        <div style={s.ctaTitle}>Pronto para melhorar seu currículo?</div>
        <button style={s.ctaBtn}>Adaptar meu CV →</button>
      </div>
      {/* Links grid */}
      <div style={s.linksGrid}>
        {cols.map(col => (
          <div key={col.label}>
            <div style={s.colLabel}>{col.label}</div>
            {col.links.map(l => (
              <div key={l} style={s.colLink}>{l}</div>
            ))}
          </div>
        ))}
      </div>
      {/* Bottom bar */}
      <div style={s.bottom}>
        <span style={s.bottomMono}>Dados protegidos conforme LGPD</span>
        <span style={s.bottomMono}>EarlyCV © 2026</span>
      </div>
    </div>
  );
}

const footerStyles = {
  footer: {
    background: '#0a0a0a', color: '#fafaf6', position: 'relative',
    overflow: 'hidden',
  },
  ctaStrip: {
    borderBottom: '1px solid rgba(250,250,246,0.06)',
    padding: '40px',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  },
  ctaTitle: {
    fontSize: 22, fontWeight: 500, letterSpacing: -0.7, color: '#fafaf6',
  },
  ctaBtn: {
    background: '#fafaf6', color: '#0a0a0a', border: 'none',
    borderRadius: 8, padding: '11px 18px', fontSize: 13.5, fontWeight: 600,
    cursor: 'pointer', fontFamily: 'inherit',
  },
  linksGrid: {
    display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)',
    gap: 40, padding: '40px 40px 32px',
  },
  colLabel: {
    fontFamily: "'Geist Mono', monospace", fontSize: 10,
    letterSpacing: 1.2, color: '#5a5a55', fontWeight: 500, marginBottom: 14,
  },
  colLink: {
    fontSize: 13.5, color: '#a0a098', cursor: 'pointer',
    marginBottom: 10, lineHeight: 1.4,
  },
  bottom: {
    display: 'flex', justifyContent: 'space-between',
    padding: '16px 40px',
    borderTop: '1px solid rgba(250,250,246,0.06)',
  },
  bottomMono: {
    fontFamily: "'Geist Mono', monospace", fontSize: 11,
    color: '#4a4a48', letterSpacing: 0.3,
  },
};

window.LogoIcon = LogoIcon;
window.LogoLockup = LogoLockup;
window.Grain = Grain;
window.NavBar = NavBar;
window.CtaBlock = CtaBlock;
window.SiteFooter = SiteFooter;
