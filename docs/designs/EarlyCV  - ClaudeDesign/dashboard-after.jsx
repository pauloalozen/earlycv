// ========== DASHBOARD AFTER ==========
// Mesma linguagem: nav com logo+v1.2, kickers mono, Instrument Serif em
// ênfases editoriais, grain, card preto para destaque, métricas tabular.

function DashboardAfter() {
  const s = dashStyles;
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
          <div style={s.navCredits}>
            <span style={s.navCreditsLabel}>CRÉDITOS</span>
            <span style={s.navCreditsVal}>13</span>
          </div>
          <button style={s.navPill}>
            <span style={s.navAvatar}>P</span> Paulo
            <span style={s.navChev}>▾</span>
          </button>
        </div>
      </div>

      <div style={s.main}>
        {/* Header */}
        <div style={s.header}>
          <div style={s.kicker}>
            <span style={s.kickerDot} />
            DASHBOARD · HOJE · QUI 17 ABR
          </div>
          <h1 style={s.h1}>
            Olá, <em style={s.em}>Paulo.</em>
          </h1>
          <div style={s.sub}>
            Você tem <strong>13 créditos</strong>, 1 CV base e 26 análises no histórico.
          </div>
        </div>

        {/* Top grid: 2 action cards */}
        <div style={s.topGrid}>
          {/* Next step — card preto destaque */}
          <div style={s.cardDark}>
            <div style={s.cardDarkKicker}>
              <span style={s.kickerDot} />
              PRÓXIMO PASSO
            </div>
            <div style={s.cardDarkTitle}>
              Analisar <em style={s.emLight}>nova vaga.</em>
            </div>
            <div style={s.cardDarkSub}>
              Leva menos de 2 minutos. Cole a vaga, envie seu CV,
              veja exatamente o que ajustar.
            </div>
            <div style={s.cardDarkRow}>
              <button style={s.cardDarkCta}>
                Analisar nova vaga <span style={s.arrow}>→</span>
              </button>
              <div style={s.cardDarkMeta}>
                <span style={s.cardDarkMetaK}>TEMPO MÉDIO</span>
                <span style={s.cardDarkMetaV}>1m 47s</span>
              </div>
            </div>
          </div>

          {/* CV Master */}
          <div style={s.cardLight}>
            <div style={s.cardLightHead}>
              <div style={s.kickerLight}>
                <span style={s.kickerDot} />
                CV MASTER
              </div>
              <span style={s.cardLightBadge}>● pronto</span>
            </div>
            <div style={s.cardLightTitle}>
              Seu CV base está <em style={s.em}>pronto.</em>
            </div>
            <div style={s.cardLightSub}>
              Use como ponto de partida em novas análises.
            </div>

            <div style={s.cvFile}>
              <div style={s.cvFileIcon}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5z" stroke="#0a0a0a" strokeWidth="1.5"/>
                  <path d="M14 3v5h5" stroke="#0a0a0a" strokeWidth="1.5"/>
                </svg>
              </div>
              <div style={s.cvFileBody}>
                <div style={s.cvFileName}>CV_Paulo_LeadData.pdf</div>
                <div style={s.cvFileMeta}>Atualizado · 17 abr · v4</div>
              </div>
              <div style={s.cvFileScore}>
                <div style={s.cvFileScoreNum}>87</div>
                <div style={s.cvFileScoreLabel}>ATS</div>
              </div>
            </div>

            <div style={s.cvActions}>
              <button style={s.btnDark}>Atualizar CV</button>
              <button style={s.btnGhost}>Ver CV</button>
              <button style={s.btnGhost}>Baixar</button>
            </div>
          </div>
        </div>

        {/* Metrics row — 3 KPI tiles */}
        <div style={s.metricsGrid}>
          <Kpi k="SEU SCORE MÉDIO" v="75" suffix="%" trend="+8 nos últimos 30d" up />
          <Kpi k="VAGAS ANALISADAS" v="26" suffix="" trend="12 neste mês" up />
          <Kpi k="MELHORIA MÉDIA" v="+12" suffix="%" trend="sobre CV original" accent />
          <Kpi k="CRÉDITOS RESTANTES" v="13" suffix="" trend="última compra há 6d" muted />
        </div>

        {/* Historic table */}
        <div style={s.historic}>
          <div style={s.histHead}>
            <div>
              <div style={s.kickerLight}>
                <span style={s.kickerDotMono} />
                HISTÓRICO DE ANÁLISES
              </div>
              <div style={s.histTitle}>Últimas análises</div>
              <div style={s.histSub}>mostrando 1–10 de 26</div>
            </div>
            <div style={s.histControls}>
              <div style={s.pageSize}>
                <span style={s.pageSizeActive}>10</span>
                <span style={s.pageSizeItem}>20</span>
                <span style={s.pageSizeItem}>50</span>
              </div>
              <button style={s.btnGhost}>Exportar CSV</button>
            </div>
          </div>

          <div style={s.tableHead}>
            <div style={{ flex: '0 0 80px' }}>DATA</div>
            <div style={{ flex: 1 }}>VAGA / EMPRESA</div>
            <div style={{ flex: '0 0 80px', textAlign: 'right' }}>SCORE</div>
            <div style={{ flex: '0 0 80px', textAlign: 'right' }}>DELTA</div>
            <div style={{ flex: '0 0 200px', textAlign: 'right' }}></div>
          </div>

          <TableRow date="17 abr" title="Lead de Data & Analytics" co="Reclame AQUI" score={75} delta="+12" liberated={false} />
          <TableRow date="14 abr" title="Data Scientist Sr" co="Itaú" score={91} delta="+24" liberated={true} />
          <TableRow date="11 abr" title="Product Manager · Growth" co="Nubank" score={83} delta="+18" liberated={true} />
          <TableRow date="08 abr" title="Senior Backend Engineer" co="Stone" score={68} delta="+6" liberated={false} />
          <TableRow date="04 abr" title="Head of Data" co="iFood" score={79} delta="+14" liberated={true} />
        </div>
      </div>
    </div>
  );
}

function Kpi({ k, v, suffix, trend, up, accent, muted }) {
  return (
    <div style={{
      background: '#fafaf6',
      border: '1px solid rgba(10,10,10,0.08)',
      borderRadius: 12,
      padding: '16px 18px',
    }}>
      <div style={{
        fontFamily: '"Geist Mono", monospace', fontSize: 10,
        letterSpacing: 1, color: '#8a8a85', fontWeight: 500,
        marginBottom: 8,
      }}>{k}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 2 }}>
        <div style={{
          fontSize: 34, fontWeight: 500, letterSpacing: -1.4,
          color: accent ? '#405410' : '#0a0a0a',
          fontVariantNumeric: 'tabular-nums',
        }}>{v}</div>
        <div style={{
          fontSize: 18, color: '#8a8a85', letterSpacing: -0.5,
        }}>{suffix}</div>
      </div>
      <div style={{
        fontFamily: '"Geist Mono", monospace', fontSize: 10.5,
        color: up ? '#405410' : (muted ? '#8a8a85' : '#5a5a55'),
        letterSpacing: 0.3, marginTop: 4,
      }}>
        {up && '↑ '}{trend}
      </div>
    </div>
  );
}

function TableRow({ date, title, co, score, delta, liberated }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '14px 16px',
      borderTop: '1px solid rgba(10,10,10,0.06)',
      fontSize: 13,
    }}>
      <div style={{
        flex: '0 0 80px',
        fontFamily: '"Geist Mono", monospace', fontSize: 11,
        color: '#8a8a85', letterSpacing: 0.2,
      }}>{date}</div>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 500, color: '#0a0a0a' }}>{title}</div>
        <div style={{ fontSize: 11.5, color: '#8a8a85', marginTop: 2 }}>{co}</div>
      </div>
      <div style={{
        flex: '0 0 80px', textAlign: 'right',
        fontSize: 18, fontWeight: 500, letterSpacing: -0.6,
        color: score >= 80 ? '#405410' : '#0a0a0a',
        fontVariantNumeric: 'tabular-nums',
      }}>{score}</div>
      <div style={{
        flex: '0 0 80px', textAlign: 'right',
        fontFamily: '"Geist Mono", monospace', fontSize: 12,
        color: '#405410', fontWeight: 500,
      }}>{delta}</div>
      <div style={{ flex: '0 0 200px', textAlign: 'right', display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
        <button style={{
          background: 'transparent', border: '1px solid rgba(10,10,10,0.12)',
          borderRadius: 7, padding: '6px 10px', fontSize: 12, fontWeight: 500,
          cursor: 'pointer', fontFamily: 'inherit',
        }}>Rever</button>
        {liberated ? (
          <button style={{
            background: 'transparent', border: '1px solid rgba(10,10,10,0.12)',
            borderRadius: 7, padding: '6px 10px', fontSize: 12, fontWeight: 500,
            cursor: 'pointer', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 4,
          }}>↓ Baixar</button>
        ) : (
          <button style={{
            background: '#0a0a0a', color: '#fff', border: 'none',
            borderRadius: 7, padding: '6px 10px', fontSize: 12, fontWeight: 500,
            cursor: 'pointer', fontFamily: 'inherit',
          }}>Liberar · 1 crédito</button>
        )}
      </div>
    </div>
  );
}

const dashStyles = {
  page: {
    width: 1440, minHeight: 1100,
    background: 'radial-gradient(ellipse 80% 60% at 50% 0%, #f9f8f4 0%, #ecebe5 100%)',
    fontFamily: '"Geist", sans-serif', color: '#0a0a0a', position: 'relative',
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
  navRight: { display: 'flex', alignItems: 'center', gap: 14 },
  navCredits: {
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '7px 12px',
    border: '1px solid rgba(10,10,10,0.08)',
    borderRadius: 8, background: '#fafaf6',
  },
  navCreditsLabel: {
    fontFamily: '"Geist Mono", monospace', fontSize: 9.5,
    letterSpacing: 1, color: '#8a8a85', fontWeight: 500,
  },
  navCreditsVal: {
    fontSize: 14, fontWeight: 500, letterSpacing: -0.3,
    fontVariantNumeric: 'tabular-nums',
  },
  navPill: {
    display: 'inline-flex', alignItems: 'center', gap: 8,
    background: '#fff', border: '1px solid rgba(10,10,10,0.08)',
    borderRadius: 999, padding: '5px 10px 5px 5px',
    fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit',
  },
  navAvatar: {
    width: 24, height: 24, borderRadius: '50%',
    background: '#0a0a0a', color: '#fafaf6',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 11, fontWeight: 600,
  },
  navChev: { fontSize: 9, color: '#8a8a85' },

  main: { padding: '40px 64px 60px', position: 'relative', zIndex: 2, maxWidth: 1440, margin: '0 auto' },
  header: { marginBottom: 32 },
  kicker: {
    display: 'inline-flex', alignItems: 'center', gap: 8,
    fontFamily: '"Geist Mono", monospace',
    fontSize: 10.5, letterSpacing: 1.2, fontWeight: 500, color: '#555',
    background: 'rgba(10,10,10,0.04)',
    border: '1px solid rgba(10,10,10,0.06)',
    padding: '6px 10px', borderRadius: 999,
    marginBottom: 18,
  },
  kickerDot: { width: 6, height: 6, borderRadius: '50%', background: '#c6ff3a', boxShadow: '0 0 6px #c6ff3a' },
  kickerDotMono: { width: 6, height: 6, borderRadius: '50%', background: '#0a0a0a' },
  h1: {
    fontSize: 52, fontWeight: 500, letterSpacing: -2, lineHeight: 1,
    margin: '0 0 8px',
  },
  em: { fontFamily: '"Instrument Serif", serif', fontStyle: 'italic', fontWeight: 400 },
  emLight: { fontFamily: '"Instrument Serif", serif', fontStyle: 'italic', fontWeight: 400, color: '#c6ff3a' },
  sub: { fontSize: 15.5, color: '#45443e', lineHeight: 1.5 },

  topGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 },

  cardDark: {
    background: '#0a0a0a', color: '#fafaf6',
    borderRadius: 16, padding: '24px 26px',
    boxShadow: '0 24px 60px -20px rgba(10,10,10,0.3)',
    display: 'flex', flexDirection: 'column', gap: 0,
  },
  cardDarkKicker: {
    display: 'inline-flex', alignItems: 'center', gap: 8,
    fontFamily: '"Geist Mono", monospace',
    fontSize: 10.5, letterSpacing: 1.2, fontWeight: 500, color: '#a0a098',
    width: 'fit-content', marginBottom: 14,
  },
  cardDarkTitle: {
    fontSize: 32, fontWeight: 500, letterSpacing: -1.4, lineHeight: 1.04,
    color: '#fafaf6', marginBottom: 10,
  },
  cardDarkSub: {
    fontSize: 14, color: '#a0a098', lineHeight: 1.5, marginBottom: 22,
    maxWidth: 380,
  },
  cardDarkRow: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    marginTop: 'auto', gap: 16,
  },
  cardDarkCta: {
    background: '#c6ff3a', color: '#0a0a0a', border: 'none',
    borderRadius: 10, padding: '12px 18px', fontSize: 13.5, fontWeight: 500,
    cursor: 'pointer', fontFamily: 'inherit',
    display: 'inline-flex', alignItems: 'center', gap: 8,
    boxShadow: '0 6px 14px rgba(198,255,58,0.2)',
  },
  arrow: { display: 'inline-block' },
  cardDarkMeta: { display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'flex-end' },
  cardDarkMetaK: {
    fontFamily: '"Geist Mono", monospace', fontSize: 9.5,
    letterSpacing: 0.8, color: '#7a7a74',
  },
  cardDarkMetaV: {
    fontFamily: '"Geist Mono", monospace', fontSize: 13,
    color: '#e8e7df', fontWeight: 500, letterSpacing: -0.2,
  },

  cardLight: {
    background: '#fafaf6', border: '1px solid rgba(10,10,10,0.08)',
    borderRadius: 16, padding: '22px 24px',
    display: 'flex', flexDirection: 'column',
  },
  cardLightHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 },
  kickerLight: {
    display: 'inline-flex', alignItems: 'center', gap: 8,
    fontFamily: '"Geist Mono", monospace',
    fontSize: 10.5, letterSpacing: 1.2, fontWeight: 500, color: '#555',
  },
  cardLightBadge: {
    fontFamily: '"Geist Mono", monospace', fontSize: 10,
    background: 'rgba(198,255,58,0.3)', color: '#405410',
    padding: '3px 8px', borderRadius: 4, letterSpacing: 0.5,
    border: '1px solid rgba(110,150,20,0.2)', fontWeight: 500,
  },
  cardLightTitle: {
    fontSize: 24, fontWeight: 500, letterSpacing: -1, lineHeight: 1.1,
    marginBottom: 4,
  },
  cardLightSub: {
    fontSize: 13.5, color: '#6a6560', marginBottom: 16, lineHeight: 1.5,
  },
  cvFile: {
    display: 'flex', alignItems: 'center', gap: 12,
    padding: '12px 14px',
    border: '1px solid rgba(10,10,10,0.08)', borderRadius: 10,
    background: '#fff', marginBottom: 14,
  },
  cvFileIcon: {
    width: 32, height: 32, borderRadius: 8,
    background: 'rgba(10,10,10,0.04)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  cvFileBody: { flex: 1 },
  cvFileName: { fontSize: 13, fontWeight: 500, letterSpacing: -0.2 },
  cvFileMeta: {
    fontFamily: '"Geist Mono", monospace', fontSize: 10.5,
    color: '#8a8a85', letterSpacing: 0.3, marginTop: 2,
  },
  cvFileScore: {
    display: 'flex', flexDirection: 'column', alignItems: 'flex-end',
    paddingLeft: 10, borderLeft: '1px solid rgba(10,10,10,0.06)',
  },
  cvFileScoreNum: {
    fontSize: 22, fontWeight: 500, letterSpacing: -0.8, color: '#405410',
    fontVariantNumeric: 'tabular-nums', lineHeight: 1,
  },
  cvFileScoreLabel: {
    fontFamily: '"Geist Mono", monospace', fontSize: 9,
    color: '#8a8a85', letterSpacing: 1, marginTop: 2,
  },
  cvActions: { display: 'flex', gap: 8, marginTop: 'auto' },
  btnDark: {
    background: '#0a0a0a', color: '#fff', border: 'none',
    borderRadius: 8, padding: '9px 14px', fontSize: 12.5, fontWeight: 500,
    cursor: 'pointer', fontFamily: 'inherit',
  },
  btnGhost: {
    background: 'transparent', border: '1px solid rgba(10,10,10,0.12)',
    borderRadius: 8, padding: '9px 14px', fontSize: 12.5, fontWeight: 500,
    cursor: 'pointer', fontFamily: 'inherit',
  },

  metricsGrid: {
    display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12,
    marginBottom: 24,
  },

  historic: {
    background: '#fafaf6', border: '1px solid rgba(10,10,10,0.08)',
    borderRadius: 16, padding: '22px 24px',
  },
  histHead: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end',
    marginBottom: 18, gap: 20,
  },
  histTitle: {
    fontSize: 22, fontWeight: 500, letterSpacing: -0.8, marginTop: 8,
  },
  histSub: {
    fontFamily: '"Geist Mono", monospace', fontSize: 10.5,
    color: '#8a8a85', letterSpacing: 0.3, marginTop: 4,
  },
  histControls: { display: 'flex', gap: 10, alignItems: 'center' },
  pageSize: {
    display: 'flex', background: '#fff', border: '1px solid rgba(10,10,10,0.08)',
    borderRadius: 8, padding: 3,
    fontFamily: '"Geist Mono", monospace', fontSize: 11, fontWeight: 500,
  },
  pageSizeActive: {
    background: '#0a0a0a', color: '#fff', borderRadius: 5,
    padding: '4px 10px', cursor: 'pointer',
  },
  pageSizeItem: { padding: '4px 10px', color: '#8a8a85', cursor: 'pointer' },
  tableHead: {
    display: 'flex', gap: 12, padding: '8px 16px',
    fontFamily: '"Geist Mono", monospace', fontSize: 9.5,
    letterSpacing: 1, color: '#8a8a85', fontWeight: 500,
  },
};

window.DashboardAfter = DashboardAfter;
