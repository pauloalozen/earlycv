// ========== DASHBOARD V2 ==========
// Baseado nos screenshots reais: greeting, CV master (sem CV cadastrado),
// próximo passo card, 3 KPIs, histórico com 4 linhas, modal Ajustes Feitos.

function DashboardV2() {
  const s = dash2Styles;
  const [modal, setModal] = React.useState(false);

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
        <button style={s.navPill}>
          <span style={s.navAvatar}>P</span>
          Paulo
          <span style={s.navChev}>▾</span>
        </button>
      </div>

      <div style={s.main}>
        {/* Greeting */}
        <h1 style={s.greeting}>
          Olá, Paulo <em style={s.em}>bem-vindo.</em>
        </h1>

        {/* Visão Geral stripe */}
        <div style={s.visaoGeral}>
          <div style={s.visaoLeft}>
            <div style={s.visaoKicker}>VISÃO GERAL</div>
            <div style={s.visaoRow}>
              <span style={s.visaoLabel}>Créditos de download:</span>
              <span style={s.visaoVal}>∞</span>
            </div>
          </div>
          <button style={s.buyBtn}>Comprar créditos</button>
        </div>

        {/* Two-col: CV Master + Próximo Passo */}
        <div style={s.twoCol}>
          {/* CV Master */}
          <div style={s.cvCard}>
            <div style={s.cvKicker}>CV MASTER</div>
            <div style={s.cvTitle}>Cadastre seu <em style={s.em}>CV base.</em></div>
            <div style={s.cvSub}>
              Evite subir seu currículo toda vez. Use um CV base para todas as análises.
            </div>
            <div style={s.cvInput}>
              <span style={s.cvInputPh}>Selecionar PDF...</span>
            </div>
            <button style={s.cvSaveBtn}>Salvar CV</button>
          </div>

          {/* Próximo Passo */}
          <div style={s.nextCard}>
            <div style={s.nextKicker}>
              <span style={s.kickerDot} />
              PRÓXIMO PASSO
            </div>
            <div style={s.nextTitle}>
              Analisar <em style={s.emLight}>nova vaga.</em>
            </div>
            <div style={s.nextSub}>Leva menos de 2 minutos.</div>
            <button style={s.nextCta}>Adaptar meu CV →</button>
          </div>
        </div>

        {/* 3 KPIs */}
        <div style={s.kpiGrid}>
          <Kpi2 label="Vagas analisadas" value="4" />
          <Kpi2 label="Melhoria recente" value="+25%" accent />
          <Kpi2 label="Seu score médio" value="84%" accent />
        </div>

        {/* Histórico */}
        <div style={s.historic}>
          <div style={s.histHead}>
            <div>
              <div style={s.histKicker}>HISTÓRICO DE ANÁLISES</div>
              <div style={s.histSub}>Mostrando 1–4 de 4</div>
            </div>
            <div style={s.pageSize}>
              <span style={s.pageSizeActive}>10</span>
              <span style={s.pageSizeItem}>20</span>
              <span style={s.pageSizeItem}>50</span>
            </div>
          </div>

          <Dash2Row
            title="Senior Data Scientist (Success Manager) - AB InBev"
            date="25 de abr. de 2026"
            score="83%"
            delta="+16% após ajustes"
            actions={[
              { label: 'Rever análise', ghost: true },
              { label: 'Ajustes feitos', dark: true, onClick: () => setModal(true) },
              { label: 'Baixar PDF', ghost: true },
              { label: 'Baixar DOCX', ghost: true },
            ]}
          />
          <Dash2Row
            title="Engenheira de Dados Sênior - Nubank"
            date="25 de abr. de 2026"
            score="87%"
            delta="+45% após ajustes"
            actions={[
              { label: 'Rever análise', ghost: true },
              { label: 'Liberar CV · 1 Crédito', dark: true },
            ]}
          />
          <Dash2Row
            title="Data Product Manager | Computer Vision & Machine Learning - BEES"
            date="25 de abr. de 2026"
            score="79%"
            delta="+22% após ajustes"
            actions={[
              { label: 'Rever análise', ghost: true },
              { label: 'Ajustes feitos', dark: true, onClick: () => setModal(true) },
              { label: 'Baixar PDF', ghost: true },
              { label: 'Baixar DOCX', ghost: true },
            ]}
          />
          <Dash2Row
            title="Analista de Dados Sênior - Nubank"
            date="25 de abr. de 2026"
            score="85%"
            delta="+16% após ajustes"
            actions={[
              { label: 'Rever análise', ghost: true },
              { label: 'Liberar CV · 1 Crédito', dark: true },
            ]}
            last
          />
        </div>
      </div>

      {/* Modal Ajustes Feitos */}
      {modal && (
        <div style={s.modalOverlay}>
          <div style={s.modal}>
            <div style={s.modalHeader}>
              <div>
                <div style={s.modalTitle}>Ajustes feitos</div>
                <div style={s.modalSub}>Resumo do que foi aplicado no seu CV para esta vaga.</div>
              </div>
              <button style={s.modalClose} onClick={() => setModal(false)}>✕</button>
            </div>

            <div style={s.modalContext}>
              <div style={s.modalContextKicker}>CONTEXTO DA ANÁLISE</div>
              <div style={s.modalContextRow}>
                <span style={s.modalContextK}>Vaga:</span>
                <span style={s.modalContextV}>Senior Data Scientist (Success Manager)</span>
              </div>
              <div style={s.modalContextRow}>
                <span style={s.modalContextK}>CV master usado:</span>
                <span style={s.modalContextV}>CV para Senior Data Scientist (Success Manager)</span>
              </div>
            </div>

            <div style={s.scoresRow}>
              <div style={s.scoreBox}>
                <div style={s.scoreBoxKicker}>SCORE ANTES</div>
                <div style={s.scoreBoxNum}>67%</div>
              </div>
              <div style={s.scoreArrow}>→</div>
              <div style={{ ...s.scoreBox, ...s.scoreBoxAccent }}>
                <div style={{ ...s.scoreBoxKicker, color: '#405410' }}>SCORE APÓS AJUSTES</div>
                <div style={{ ...s.scoreBoxNum, color: '#405410' }}>83%</div>
              </div>
            </div>

            <div style={s.modalWhat}>
              <div style={s.modalWhatKicker}>O QUE FOI FEITO NO SEU CV</div>
              <p style={s.modalWhatBody}>
                Reposicionei o perfil de gestor para cientista de dados hands-on, destacando
                execução técnica nos projetos. Incorporei keywords críticas como Python, SQL,
                estatística e visualização diretamente nas experiências. Priorizei impacto
                mensurável e conexão direta com requisitos analíticos da vaga, reduzindo
                excesso gerencial.
              </p>
            </div>

            <div style={s.modalFooter}>
              <button style={s.modalBtnGhost} onClick={() => setModal(false)}>Fechar</button>
              <button style={s.modalBtnDark}>Ver análise completa</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Kpi2({ label, value, accent }) {
  return (
    <div style={{
      background: '#fafaf6', border: '1px solid rgba(10,10,10,0.08)',
      borderRadius: 12, padding: '16px 20px',
    }}>
      <div style={{
        fontFamily: '"Geist Mono", monospace', fontSize: 10,
        letterSpacing: 1, color: '#8a8a85', fontWeight: 500, marginBottom: 6,
      }}>{label.toUpperCase()}</div>
      <div style={{
        fontSize: 32, fontWeight: 500, letterSpacing: -1.2,
        color: accent ? '#2a6a10' : '#0a0a0a',
        fontVariantNumeric: 'tabular-nums', lineHeight: 1,
      }}>{value}</div>
    </div>
  );
}

function Dash2Row({ title, date, score, delta, actions, last }) {
  return (
    <div style={{
      padding: '16px 0',
      borderTop: '1px solid rgba(10,10,10,0.06)',
      borderBottom: last ? '1px solid rgba(10,10,10,0.06)' : 'none',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 500, letterSpacing: -0.2, color: '#0a0a0a', marginBottom: 3 }}>{title}</div>
          <div style={{ fontFamily: '"Geist Mono", monospace', fontSize: 10.5, color: '#8a8a85', letterSpacing: 0.2 }}>{date}</div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0, paddingLeft: 20 }}>
          <div style={{
            fontFamily: '"Geist Mono", monospace', fontSize: 10,
            color: '#8a8a85', letterSpacing: 0.5, marginBottom: 2,
          }}>SCORE</div>
          <div style={{ fontSize: 22, fontWeight: 500, color: '#2a6a10', letterSpacing: -0.8, fontVariantNumeric: 'tabular-nums' }}>{score}</div>
          <div style={{ fontFamily: '"Geist Mono", monospace', fontSize: 10, color: '#2a6a10' }}>{delta}</div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {actions.map((a, i) => (
          <button key={i} onClick={a.onClick}
            style={{
              background: a.dark ? '#0a0a0a' : 'transparent',
              color: a.dark ? '#fff' : '#0a0a0a',
              border: a.ghost ? '1px solid rgba(10,10,10,0.15)' : (a.dark ? 'none' : 'none'),
              borderRadius: 8, padding: '7px 12px',
              fontSize: 12.5, fontWeight: 500,
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >{a.label}</button>
        ))}
      </div>
    </div>
  );
}

const dash2Styles = {
  page: {
    width: 1440, minHeight: 1000,
    background: 'radial-gradient(ellipse 80% 40% at 50% 0%, #f9f8f4 0%, #ecebe5 100%)',
    fontFamily: '"Geist", sans-serif', color: '#0a0a0a', position: 'relative',
  },
  grain: {
    position: 'absolute', inset: 0, pointerEvents: 'none', opacity: 0.5,
    backgroundImage: `url("data:image/svg+xml;utf8,<svg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.035 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>")`,
    mixBlendMode: 'multiply',
  },
  nav: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '20px 40px', position: 'relative', zIndex: 2,
    borderBottom: '1px solid rgba(0,0,0,0.04)',
  },
  logoWrap: { display: 'flex', alignItems: 'center', gap: 10 },
  logoDot: { width: 18, height: 18, borderRadius: 5, background: '#0a0a0a', boxShadow: 'inset -2px -2px 0 rgba(198,255,58,0.85)' },
  logo: { fontSize: 17, fontWeight: 600, letterSpacing: -0.4 },
  logoVer: { fontFamily: '"Geist Mono", monospace', fontSize: 10, color: '#8a8a85', border: '1px solid #d8d6ce', borderRadius: 3, padding: '1px 5px', fontWeight: 500 },
  navPill: {
    display: 'inline-flex', alignItems: 'center', gap: 8,
    background: '#fff', border: '1px solid rgba(10,10,10,0.08)',
    borderRadius: 999, padding: '5px 10px 5px 5px',
    fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit',
  },
  navAvatar: {
    width: 26, height: 26, borderRadius: '50%',
    background: '#0a0a0a', color: '#fafaf6',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 11, fontWeight: 600,
  },
  navChev: { fontSize: 9, color: '#8a8a85' },
  main: { padding: '40px 80px 60px', position: 'relative', zIndex: 2 },
  greeting: {
    fontSize: 46, fontWeight: 500, letterSpacing: -1.8, lineHeight: 1,
    margin: '0 0 24px',
  },
  em: { fontFamily: '"Instrument Serif", serif', fontStyle: 'italic', fontWeight: 400 },
  emLight: { fontFamily: '"Instrument Serif", serif', fontStyle: 'italic', fontWeight: 400, color: '#c6ff3a' },
  visaoGeral: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    background: '#fafaf6', border: '1px solid rgba(10,10,10,0.08)',
    borderRadius: 12, padding: '14px 18px', marginBottom: 20,
  },
  visaoLeft: {},
  visaoKicker: { fontFamily: '"Geist Mono", monospace', fontSize: 9.5, letterSpacing: 1, color: '#8a8a85', fontWeight: 500, marginBottom: 4 },
  visaoRow: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 },
  visaoLabel: { color: '#5a5a55' },
  visaoVal: { fontSize: 20, fontWeight: 500, letterSpacing: -0.5 },
  buyBtn: {
    background: '#0a0a0a', color: '#fff', border: 'none',
    borderRadius: 8, padding: '10px 16px', fontSize: 13, fontWeight: 500,
    cursor: 'pointer', fontFamily: 'inherit',
  },
  twoCol: { display: 'grid', gridTemplateColumns: '1fr 0.75fr', gap: 16, marginBottom: 16 },
  cvCard: {
    background: '#fafaf6', border: '1px solid rgba(10,10,10,0.08)',
    borderRadius: 14, padding: '22px 24px',
  },
  cvKicker: { fontFamily: '"Geist Mono", monospace', fontSize: 9.5, letterSpacing: 1, color: '#8a8a85', fontWeight: 500, marginBottom: 10 },
  cvTitle: { fontSize: 22, fontWeight: 500, letterSpacing: -0.8, lineHeight: 1.1, marginBottom: 8 },
  cvSub: { fontSize: 13.5, color: '#5a5a55', lineHeight: 1.55, marginBottom: 16, maxWidth: 460 },
  cvInput: {
    background: '#fff', border: '1px solid #d8d6ce', borderRadius: 8,
    padding: '11px 13px', fontSize: 13.5, color: '#a8a6a0', marginBottom: 10,
  },
  cvInputPh: {},
  cvSaveBtn: {
    background: '#0a0a0a', color: '#fff', border: 'none',
    borderRadius: 8, padding: '10px 16px', fontSize: 13, fontWeight: 500,
    cursor: 'pointer', fontFamily: 'inherit',
  },
  nextCard: {
    background: '#0a0a0a', color: '#fafaf6',
    borderRadius: 14, padding: '24px 26px',
    display: 'flex', flexDirection: 'column', justifyContent: 'center',
    boxShadow: '0 20px 50px -16px rgba(10,10,10,0.4)',
  },
  nextKicker: {
    display: 'inline-flex', alignItems: 'center', gap: 8,
    fontFamily: '"Geist Mono", monospace', fontSize: 10, letterSpacing: 1.2,
    color: '#7a7a74', fontWeight: 500, marginBottom: 16, width: 'fit-content',
  },
  kickerDot: { width: 6, height: 6, borderRadius: '50%', background: '#c6ff3a', boxShadow: '0 0 6px #c6ff3a' },
  nextTitle: { fontSize: 28, fontWeight: 500, letterSpacing: -1.2, lineHeight: 1.05, marginBottom: 6 },
  nextSub: { fontSize: 13.5, color: '#a0a098', marginBottom: 22 },
  nextCta: {
    background: '#c6ff3a', color: '#0a0a0a', border: 'none',
    borderRadius: 10, padding: '12px 18px', fontSize: 14, fontWeight: 600,
    cursor: 'pointer', fontFamily: 'inherit', width: 'fit-content',
    boxShadow: '0 6px 14px rgba(198,255,58,0.2)',
  },
  kpiGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16 },
  historic: {
    background: '#fafaf6', border: '1px solid rgba(10,10,10,0.08)',
    borderRadius: 14, padding: '20px 24px',
  },
  histHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 16 },
  histKicker: { fontFamily: '"Geist Mono", monospace', fontSize: 9.5, letterSpacing: 1, color: '#8a8a85', fontWeight: 500, marginBottom: 4 },
  histSub: { fontFamily: '"Geist Mono", monospace', fontSize: 10.5, color: '#8a8a85' },
  pageSize: {
    display: 'flex', background: '#fff', border: '1px solid rgba(10,10,10,0.08)',
    borderRadius: 8, padding: 3, fontFamily: '"Geist Mono", monospace', fontSize: 11, fontWeight: 500,
  },
  pageSizeActive: {
    background: '#0a0a0a', color: '#fff', borderRadius: 5,
    padding: '4px 10px', cursor: 'pointer',
  },
  pageSizeItem: { padding: '4px 10px', color: '#8a8a85', cursor: 'pointer' },
  // Modal
  modalOverlay: {
    position: 'absolute', inset: 0, background: 'rgba(10,10,10,0.45)',
    backdropFilter: 'blur(4px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 10,
  },
  modal: {
    background: '#fafaf6', borderRadius: 18, width: 560,
    boxShadow: '0 32px 80px -20px rgba(10,10,10,0.5)',
    overflow: 'hidden',
  },
  modalHeader: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
    padding: '22px 24px 16px', borderBottom: '1px solid rgba(10,10,10,0.08)',
  },
  modalTitle: { fontSize: 20, fontWeight: 500, letterSpacing: -0.6, marginBottom: 4 },
  modalSub: { fontSize: 13, color: '#5a5a55' },
  modalClose: {
    background: 'transparent', border: 'none', cursor: 'pointer',
    fontSize: 16, color: '#8a8a85', padding: 4,
  },
  modalContext: {
    background: '#fff', border: '1px solid rgba(10,10,10,0.08)',
    borderRadius: 10, margin: '16px 24px', padding: '14px 16px',
  },
  modalContextKicker: { fontFamily: '"Geist Mono", monospace', fontSize: 9.5, letterSpacing: 1, color: '#8a8a85', fontWeight: 500, marginBottom: 8 },
  modalContextRow: { display: 'flex', gap: 8, fontSize: 13, lineHeight: 1.6 },
  modalContextK: { color: '#8a8a85', flexShrink: 0 },
  modalContextV: { color: '#0a0a0a', fontWeight: 500 },
  scoresRow: {
    display: 'flex', alignItems: 'center', gap: 10,
    margin: '0 24px 16px',
  },
  scoreBox: {
    flex: 1, background: '#fff', border: '1px solid rgba(10,10,10,0.08)',
    borderRadius: 10, padding: '14px 16px', textAlign: 'center',
  },
  scoreBoxAccent: { background: 'rgba(198,255,58,0.2)', border: '1px solid rgba(110,150,20,0.2)' },
  scoreBoxKicker: { fontFamily: '"Geist Mono", monospace', fontSize: 9.5, letterSpacing: 1, color: '#8a8a85', fontWeight: 500, marginBottom: 6 },
  scoreBoxNum: { fontSize: 36, fontWeight: 500, letterSpacing: -1.4, fontVariantNumeric: 'tabular-nums' },
  scoreArrow: { fontSize: 20, color: '#c0beb4', flexShrink: 0 },
  modalWhat: { margin: '0 24px 16px' },
  modalWhatKicker: { fontFamily: '"Geist Mono", monospace', fontSize: 9.5, letterSpacing: 1, color: '#8a8a85', fontWeight: 500, marginBottom: 8 },
  modalWhatBody: { fontSize: 13.5, lineHeight: 1.65, color: '#2a2a28', margin: 0 },
  modalFooter: {
    display: 'flex', gap: 10, justifyContent: 'flex-end',
    padding: '16px 24px', borderTop: '1px solid rgba(10,10,10,0.08)',
  },
  modalBtnGhost: {
    background: 'transparent', border: '1px solid rgba(10,10,10,0.15)',
    borderRadius: 8, padding: '10px 16px', fontSize: 13, fontWeight: 500,
    cursor: 'pointer', fontFamily: 'inherit',
  },
  modalBtnDark: {
    background: '#0a0a0a', color: '#fff', border: 'none',
    borderRadius: 8, padding: '10px 16px', fontSize: 13, fontWeight: 500,
    cursor: 'pointer', fontFamily: 'inherit',
    boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
  },
};

window.DashboardV2 = DashboardV2;
