// ========== RESULTADO (NOVO) ==========
// Tela que ainda não existe. Mostra o ATS widget em tamanho real,
// lista issues, sugestões por seção, diff proposto.

function ResultadoAfter() {
  const s = resStyles;
  const score = 87;
  const R = 96, C = 2 * Math.PI * R;
  const dash = C * (score / 100);

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
            <span style={s.crumbMuted}>Adaptar</span>
            <span style={s.crumbSep}>/</span>
            <span>Relatório #A3F9</span>
          </div>
          <button style={s.navBtn}>Exportar PDF</button>
          <button style={s.navCta}>Aplicar ajustes →</button>
        </div>
      </div>

      <div style={s.main}>
        {/* Summary */}
        <div style={s.summary}>
          <div style={s.sumLeft}>
            <div style={s.kicker}>
              <span style={s.kickerDot} />
              RELATÓRIO · SENIOR FULLSTACK · ITAÚ
            </div>
            <h1 style={s.h1}>
              Seu CV está <em style={s.em}>quase lá.</em><br/>
              Faltam 3 ajustes críticos.
            </h1>
            <div style={s.sumSub}>
              Identificamos 11 itens. 8 já estão ótimos. 3 podem estar te eliminando
              nos filtros automáticos — corrigimos pra você em 1 clique.
            </div>
            <div style={s.metaRow}>
              <div style={s.metaItem}>
                <span style={s.metaNum}>11</span>
                <span style={s.metaLabel}>itens<br/>analisados</span>
              </div>
              <div style={s.metaDiv} />
              <div style={s.metaItem}>
                <span style={s.metaNum}>3</span>
                <span style={s.metaLabel}>ajustes<br/>críticos</span>
              </div>
              <div style={s.metaDiv} />
              <div style={s.metaItem}>
                <span style={s.metaNum}>24s</span>
                <span style={s.metaLabel}>tempo de<br/>análise</span>
              </div>
            </div>
          </div>

          {/* Gauge card */}
          <div style={s.gaugeCard}>
            <div style={s.gaugeLabel}>
              <span style={{ ...s.liveDot, background: '#c6ff3a' }} />
              ATS SCORE · PÓS-AJUSTES
            </div>
            <div style={s.gaugeWrap}>
              <svg width="220" height="220" viewBox="0 0 220 220">
                <circle cx="110" cy="110" r={R} stroke="#1a1a1a" strokeWidth="12" fill="none" />
                <circle
                  cx="110" cy="110" r={R}
                  stroke="#c6ff3a" strokeWidth="12" fill="none"
                  strokeDasharray={`${dash} ${C}`}
                  transform="rotate(-90 110 110)"
                  strokeLinecap="round"
                />
              </svg>
              <div style={s.gaugeCenter}>
                <div style={s.gaugeNum}>{score}</div>
                <div style={s.gaugeMonoLabel}>/ 100</div>
              </div>
            </div>
            <div style={s.gaugeDelta}>
              <span style={s.gaugeDeltaNum}>+38</span>
              <span style={s.gaugeDeltaLabel}>vs CV original</span>
            </div>
          </div>
        </div>

        {/* Issues + Diff */}
        <div style={s.grid}>
          {/* Issues col */}
          <div style={s.col}>
            <div style={s.colLabel}>ISSUES DETECTADOS</div>
            <Issue
              num="01" sev="critico"
              title="3 keywords-chave da vaga ausentes"
              body="'CI/CD', 'Kubernetes' e 'GraphQL' aparecem 7× na vaga mas 0× no seu CV. Você tem experiência — só não nomeou."
              badge="CRÍTICO"
            />
            <Issue
              num="02" sev="critico"
              title="Verbos de ação fracos em 4 bullets"
              body="'Ajudei a fazer', 'participei de' → trocar por 'liderei', 'entreguei', 'arquitetei'."
              badge="CRÍTICO"
            />
            <Issue
              num="03" sev="critico"
              title="Seção 'Projetos' sem métricas"
              body="6 projetos listados, nenhum com número. Sugerimos extrair tempo/equipe/impacto onde possível."
              badge="CRÍTICO"
            />
            <Issue
              num="04" sev="bom"
              title="Formatação ATS-safe"
              body="Sem tabelas, colunas ou ícones que quebram no parse. Ótimo."
              badge="OK"
            />
            <Issue
              num="05" sev="bom"
              title="Ordem cronológica correta"
              body="Mais recente primeiro em todas as seções relevantes."
              badge="OK"
            />
          </div>

          {/* Diff col */}
          <div style={s.col}>
            <div style={s.colLabel}>PREVIEW DO AJUSTE · BULLET #1</div>
            <div style={s.diffCard}>
              <div style={s.diffChrome}>
                <div style={{ ...s.chromeDot, background: '#ff5f57' }} />
                <div style={{ ...s.chromeDot, background: '#febc2e' }} />
                <div style={{ ...s.chromeDot, background: '#28c840' }} />
                <div style={s.chromeTitle}>experience[0].bullets[2]</div>
              </div>
              <div style={s.diffBody}>
                <div style={s.diffSection}>
                  <div style={s.diffMark}>
                    <span style={{ ...s.diffBadge, background: '#fee2e2', color: '#991b1b' }}>− antes</span>
                  </div>
                  <div style={s.diffLine}>
                    Ajudei a fazer integrações com APIs externas no time.
                  </div>
                </div>
                <div style={s.diffSection}>
                  <div style={s.diffMark}>
                    <span style={{ ...s.diffBadge, background: 'rgba(198,255,58,0.3)', color: '#405410', border: '1px solid rgba(110,150,20,0.25)' }}>+ depois</span>
                  </div>
                  <div style={{ ...s.diffLine, fontWeight: 500 }}>
                    Arquitetei <mark style={s.mark}>CI/CD</mark> e integrações <mark style={s.mark}>GraphQL</mark> com 4 serviços externos, reduzindo deploys de 45min → 8min e cobrindo 87% da base em testes.
                  </div>
                </div>
                <div style={s.diffFooter}>
                  <span style={s.diffFootMono}>KEYWORDS ADICIONADAS: 2 · AÇÃO: arquitetei · MÉTRICA: 45→8min</span>
                </div>
              </div>
            </div>

            <button style={s.applyBtn}>
              Aplicar todos os 3 ajustes <span style={{ marginLeft: 4 }}>→</span>
            </button>
            <div style={s.applyHint}>
              Você revisa cada mudança antes de baixar o CV.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Issue({ num, sev, title, body, badge }) {
  const critical = sev === 'critico';
  return (
    <div style={{
      background: '#fafaf6',
      border: '1px solid rgba(10,10,10,0.08)',
      borderRadius: 12,
      padding: '14px 16px',
      marginBottom: 8,
      display: 'grid',
      gridTemplateColumns: '28px 1fr auto',
      gap: 12,
      alignItems: 'start',
    }}>
      <div style={{
        fontFamily: '"Geist Mono", monospace', fontSize: 11,
        fontWeight: 500, color: '#8a8a85', paddingTop: 2,
      }}>{num}</div>
      <div>
        <div style={{ fontSize: 14, fontWeight: 500, letterSpacing: -0.2, marginBottom: 4 }}>
          {title}
        </div>
        <div style={{ fontSize: 12.5, color: '#5a5a55', lineHeight: 1.5 }}>
          {body}
        </div>
      </div>
      <div style={{
        fontFamily: '"Geist Mono", monospace', fontSize: 9.5,
        fontWeight: 500, letterSpacing: 1,
        padding: '3px 7px', borderRadius: 4,
        background: critical ? '#0a0a0a' : 'rgba(198,255,58,0.35)',
        color: critical ? '#fff' : '#405410',
        marginTop: 2,
      }}>{badge}</div>
    </div>
  );
}

const resStyles = {
  page: {
    width: 1440, height: 980,
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
  navRight: { display: 'flex', alignItems: 'center', gap: 16 },
  breadcrumb: {
    fontFamily: '"Geist Mono", monospace', fontSize: 11, letterSpacing: 0.4,
    display: 'flex', gap: 7,
  },
  crumbMuted: { color: '#8a8a85' },
  crumbSep: { color: '#c0beb4' },
  navBtn: {
    background: '#fff', border: '1px solid #d8d6ce', borderRadius: 8,
    padding: '8px 12px', fontSize: 12.5, fontWeight: 500, cursor: 'pointer',
    fontFamily: 'inherit',
  },
  navCta: {
    background: '#0a0a0a', color: '#fff', border: 'none', borderRadius: 8,
    padding: '9px 14px', fontSize: 12.5, fontWeight: 500, cursor: 'pointer',
    fontFamily: 'inherit',
    boxShadow: '0 1px 2px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.08)',
  },
  main: { padding: '36px 64px 40px', position: 'relative', zIndex: 2 },
  summary: {
    display: 'grid', gridTemplateColumns: '1.25fr 0.75fr', gap: 40,
    alignItems: 'center', marginBottom: 40,
  },
  sumLeft: {},
  kicker: {
    display: 'inline-flex', alignItems: 'center', gap: 8,
    fontFamily: '"Geist Mono", monospace',
    fontSize: 10.5, letterSpacing: 1.2, fontWeight: 500, color: '#555',
    background: 'rgba(10,10,10,0.04)',
    border: '1px solid rgba(10,10,10,0.06)',
    padding: '6px 10px', borderRadius: 999,
    marginBottom: 20,
  },
  kickerDot: { width: 6, height: 6, borderRadius: '50%', background: '#c6ff3a', boxShadow: '0 0 6px #c6ff3a' },
  h1: {
    fontSize: 54, fontWeight: 500, letterSpacing: -2.2, lineHeight: 1.02,
    margin: '0 0 20px',
  },
  em: { fontFamily: '"Instrument Serif", serif', fontStyle: 'italic', fontWeight: 400 },
  sumSub: {
    fontSize: 16, color: '#45443e', lineHeight: 1.55, maxWidth: 540, marginBottom: 28,
  },
  metaRow: {
    display: 'flex', alignItems: 'center', gap: 20,
    paddingTop: 20, borderTop: '1px solid rgba(10,10,10,0.08)',
  },
  metaItem: { display: 'flex', flexDirection: 'column', gap: 2 },
  metaNum: { fontSize: 28, fontWeight: 500, letterSpacing: -1.2, fontVariantNumeric: 'tabular-nums' },
  metaLabel: {
    fontFamily: '"Geist Mono", monospace', fontSize: 10.5,
    color: '#6a6a66', letterSpacing: 0.3, textTransform: 'uppercase',
    lineHeight: 1.25,
  },
  metaDiv: { width: 1, height: 38, background: 'rgba(10,10,10,0.1)' },
  gaugeCard: {
    background: '#0a0a0a', color: '#fff', borderRadius: 18,
    padding: '24px 28px',
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    boxShadow: '0 24px 60px -20px rgba(10,10,10,0.4)',
  },
  gaugeLabel: {
    display: 'inline-flex', alignItems: 'center', gap: 8,
    fontFamily: '"Geist Mono", monospace', fontSize: 10,
    letterSpacing: 1.2, color: '#a0a098', fontWeight: 500, marginBottom: 12,
  },
  liveDot: { width: 6, height: 6, borderRadius: '50%', animation: 'pulse 1.4s infinite' },
  gaugeWrap: { position: 'relative', width: 220, height: 220, marginBottom: 12 },
  gaugeCenter: {
    position: 'absolute', inset: 0,
    display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center',
  },
  gaugeNum: {
    fontSize: 76, fontWeight: 500, letterSpacing: -3, lineHeight: 1,
    color: '#fafaf6', fontVariantNumeric: 'tabular-nums',
  },
  gaugeMonoLabel: {
    fontFamily: '"Geist Mono", monospace', fontSize: 11,
    color: '#8a8a85', marginTop: 4, letterSpacing: 0.5,
  },
  gaugeDelta: {
    display: 'flex', alignItems: 'baseline', gap: 8,
    paddingTop: 12, borderTop: '1px solid rgba(250,250,246,0.1)', width: '100%',
    justifyContent: 'center',
  },
  gaugeDeltaNum: {
    fontSize: 22, fontWeight: 500, color: '#c6ff3a', letterSpacing: -0.8,
  },
  gaugeDeltaLabel: {
    fontFamily: '"Geist Mono", monospace', fontSize: 10.5,
    color: '#8a8a85', letterSpacing: 0.3,
  },
  grid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 },
  col: {},
  colLabel: {
    fontFamily: '"Geist Mono", monospace', fontSize: 10,
    letterSpacing: 1.2, color: '#8a8a85', fontWeight: 500, marginBottom: 10,
  },
  diffCard: {
    background: '#fafaf6', border: '1px solid rgba(10,10,10,0.08)',
    borderRadius: 12, overflow: 'hidden',
    boxShadow: '0 8px 30px -12px rgba(10,10,10,0.15)',
  },
  diffChrome: {
    display: 'flex', alignItems: 'center', gap: 7,
    padding: '11px 14px', borderBottom: '1px solid rgba(10,10,10,0.06)',
    background: '#f0efe9', position: 'relative',
  },
  chromeDot: { width: 11, height: 11, borderRadius: '50%' },
  chromeTitle: {
    position: 'absolute', left: 0, right: 0, textAlign: 'center',
    fontFamily: '"Geist Mono", monospace', fontSize: 11,
    color: '#7a7a74', fontWeight: 500, pointerEvents: 'none',
  },
  diffBody: { padding: '16px 18px' },
  diffSection: { marginBottom: 14 },
  diffMark: { marginBottom: 6 },
  diffBadge: {
    display: 'inline-block',
    fontFamily: '"Geist Mono", monospace', fontSize: 10,
    fontWeight: 500, letterSpacing: 0.5,
    padding: '3px 7px', borderRadius: 4,
  },
  diffLine: { fontSize: 13.5, lineHeight: 1.55, color: '#2a2a28' },
  mark: {
    background: 'rgba(198,255,58,0.35)',
    padding: '0 3px', borderRadius: 3, color: '#2a3a08',
  },
  diffFooter: {
    paddingTop: 10,
    borderTop: '1px dashed rgba(10,10,10,0.08)',
  },
  diffFootMono: {
    fontFamily: '"Geist Mono", monospace', fontSize: 10,
    letterSpacing: 0.5, color: '#7a7a74',
  },
  applyBtn: {
    width: '100%', background: '#0a0a0a', color: '#fff',
    border: 'none', borderRadius: 12, padding: '15px',
    fontSize: 14.5, fontWeight: 500, cursor: 'pointer',
    fontFamily: 'inherit', marginTop: 14,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    boxShadow: '0 4px 12px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.08)',
  },
  applyHint: {
    fontFamily: '"Geist Mono", monospace', fontSize: 10.5,
    color: '#8a8a85', textAlign: 'center', marginTop: 10,
  },
};

window.ResultadoAfter = ResultadoAfter;
