// ========== PLANOS V2: sem score + com score widget ==========

// Shared components
function PlanCard2({ tag, name, tagline, price, cents, cta, features, highlight, free }) {
  const dark = highlight;
  return (
    <div style={{
      background: dark ? '#0a0a0a' : '#fafaf6',
      color: dark ? '#fafaf6' : '#0a0a0a',
      border: dark ? 'none' : '1px solid rgba(10,10,10,0.08)',
      borderRadius: 16, padding: '22px 22px 24px',
      position: 'relative',
      boxShadow: dark ? '0 28px 70px -20px rgba(10,10,10,0.4)' : '0 1px 2px rgba(0,0,0,0.02)',
      transform: dark ? 'translateY(-10px)' : 'none',
    }}>
      {highlight && (
        <div style={{
          position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)',
          background: '#c6ff3a', color: '#0a0a0a',
          fontFamily: '"Geist Mono", monospace', fontSize: 10, fontWeight: 600, letterSpacing: 1,
          padding: '4px 12px', borderRadius: 999,
          whiteSpace: 'nowrap',
        }}>MAIS ESCOLHIDO</div>
      )}
      <div style={{ fontFamily: '"Geist Mono", monospace', fontSize: 10, letterSpacing: 1.5, color: dark ? '#a0a098' : '#8a8a85', fontWeight: 500, marginBottom: 6 }}>{tag}</div>
      <div style={{ fontSize: 16, color: dark ? '#a0a098' : '#6a6560', marginBottom: 18, lineHeight: 1.4 }}>{tagline}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 2, marginBottom: 18, paddingBottom: 18, borderBottom: dark ? '1px solid rgba(250,250,246,0.1)' : '1px solid rgba(10,10,10,0.08)' }}>
        {!free && <span style={{ fontFamily: '"Geist Mono", monospace', fontSize: 13, color: dark ? '#a0a098' : '#6a6560', marginRight: 1 }}>R$</span>}
        <span style={{ fontSize: 44, fontWeight: 500, letterSpacing: -2, color: dark ? '#fafaf6' : '#0a0a0a', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{price}</span>
        {!free && <span style={{ fontSize: 16, color: dark ? '#a0a098' : '#8a8a85', fontWeight: 500, letterSpacing: -0.3 }}>,{cents}</span>}
      </div>
      <button style={{
        width: '100%', background: dark ? '#c6ff3a' : '#0a0a0a',
        color: dark ? '#0a0a0a' : '#fafaf6', border: 'none', borderRadius: 10,
        padding: '12px', fontSize: 13.5, fontWeight: 600,
        cursor: 'pointer', fontFamily: 'inherit', marginBottom: 18,
        boxShadow: dark ? '0 6px 14px rgba(198,255,58,0.25)' : '0 4px 12px rgba(10,10,10,0.12)',
      }}>{cta}</button>
      <div style={{ fontFamily: '"Geist Mono", monospace', fontSize: 9.5, letterSpacing: 1, color: dark ? '#7a7a74' : '#8a8a85', fontWeight: 500, marginBottom: 8 }}>INCLUSO</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        {features.map((f, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: dark ? '#e8e7df' : '#2a2a28', opacity: f.muted ? 0.4 : 1 }}>
            <span style={{ width: 14, height: 14, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 700, background: dark ? 'rgba(198,255,58,0.9)' : 'rgba(198,255,58,0.4)', color: dark ? '#0a0a0a' : '#405410', flexShrink: 0 }}>✓</span>
            {f.text}
          </div>
        ))}
      </div>
    </div>
  );
}

// Planos simples (sem score)
function PlanosV2() {
  const s = planosV2Styles;
  return (
    <div style={s.page}>
      <div style={s.grain} />
      <div style={s.nav}>
        <div style={s.logoWrap}>
          <div style={s.logoDot} />
          <div style={s.logo}>earlyCV</div>
          <div style={s.logoVer}>v1.2</div>
        </div>
        <button style={s.navPill}>
          <span style={s.navAvatar}>P</span> Paulo <span style={s.navChev}>▾</span>
        </button>
      </div>

      <div style={s.main}>
        <div style={s.breadcrumb}>
          <span style={s.crumbMuted}>PLANOS</span>
          <span style={s.crumbSep}>·</span>
          <span>EARLYCV</span>
        </div>
        <h1 style={s.h1}>Escolha o pacote <em style={s.em}>certo para você.</em></h1>
        <div style={s.sub}>Um único CV bem ajustado pode ser a diferença entre ser ignorado ou<br/>chamado para entrevista.</div>

        <div style={s.grid}>
          <PlanCard2 tag="STARTER" name="Starter" tagline="Para uma vaga específica" price="11" cents="90" cta="Ajustar meu CV agora"
            features={[
              { text: '3 créditos de download de CV' },
              { text: 'Análises de vaga limitadas' },
              { text: 'Score de compatibilidade ATS' },
              { text: 'Análise de keywords da vaga' },
              { text: 'Download em PDF e DOCX' },
              { text: 'Pontos fortes e melhorias' },
            ]}
          />
          <PlanCard2 tag="PRO" name="Pro" tagline="Para quem aplica para várias vagas" price="29" cents="90" cta="Aumentar as chances" highlight
            features={[
              { text: '9 créditos de download de CV' },
              { text: 'Análises de vaga ilimitadas' },
              { text: 'Score de compatibilidade ATS' },
              { text: 'Análise de keywords da vaga' },
              { text: 'Download em PDF e DOCX' },
              { text: 'Pontos fortes e melhorias' },
              { text: 'Processamento prioritário' },
            ]}
          />
          <PlanCard2 tag="TURBO" name="Turbo" tagline="Para quem aplica todos os dias" price="59" cents="90" cta="Aplicar para mais vagas"
            features={[
              { text: '20 créditos de download de CV' },
              { text: 'Análises de vaga ilimitadas' },
              { text: 'Score de compatibilidade ATS' },
              { text: 'Análise de keywords da vaga' },
              { text: 'Download em PDF e DOCX' },
              { text: 'Pontos fortes e melhorias' },
              { text: 'Processamento prioritário' },
            ]}
          />
        </div>

        <div style={s.trustRow}>
          <span style={s.trustItem}><span style={s.tDot} /> Compatível com ATS usados por empresas como Gupy e LinkedIn</span>
          <span style={s.trustItem}><span style={s.tDot} /> Aumente suas chances de entrevista</span>
        </div>

        <div style={s.payStrip}>
          <span style={s.payIcon}>🔒</span>
          <span style={s.payText}>
            Pagamento seguro via <strong>Mercado Pago</strong> · Acesso imediato · Sem renovação automática
          </span>
        </div>
      </div>
    </div>
  );
}

// Planos com score widget
function PlanosComScore() {
  const s = planosV2Styles;
  return (
    <div style={s.page}>
      <div style={s.grain} />
      <div style={s.nav}>
        <div style={s.logoWrap}>
          <div style={s.logoDot} />
          <div style={s.logo}>earlyCV</div>
          <div style={s.logoVer}>v1.2</div>
        </div>
        <button style={s.navPill}>
          <span style={s.navAvatar}>T</span> Tim <span style={s.navChev}>▾</span>
        </button>
      </div>

      <div style={s.main}>
        <h1 style={s.h1}>Escolha o pacote <em style={s.em}>certo para você.</em></h1>
        <div style={s.sub}>Um único CV bem ajustado pode ser a diferença entre ser ignorado ou chamado para entrevista.</div>

        {/* Score widget */}
        <div style={s.scoreWidget}>
          <div style={s.scoreItem}>
            <div style={s.scoreItemLabel}>SEU SCORE ATUAL</div>
            <div style={{ ...s.scoreItemNum, color: '#f5c518' }}>75</div>
          </div>
          <div style={s.scoreDivider} />
          <div style={s.scoreItem}>
            <div style={s.scoreItemLabel}>META RECOMENDADA DE VAGA</div>
            <div style={{ ...s.scoreItemNum, color: '#0a0a0a' }}>85+</div>
          </div>
          <div style={s.scoreDivider} />
          <div style={s.scoreItem}>
            <div style={s.scoreItemLabel}>SEU SCORE PÓS AJUSTE</div>
            <div style={{ ...s.scoreItemNum, color: '#2a6a10' }}>86</div>
          </div>
          <div style={s.scoreWidgetCta}>
            <span style={s.scoreWidgetHint}>
              Otimize seu CV e <strong>aumente suas chances</strong> de ser chamado para entrevista
            </span>
          </div>
        </div>

        <div style={s.grid}>
          <PlanCard2 tag="STARTER" name="Starter" tagline="Para uma vaga específica" price="11" cents="90" cta="Ajustar meu CV agora"
            features={[
              { text: '3 créditos de download de CV' },
              { text: 'Análises de vaga ilimitadas' },
              { text: 'Score de compatibilidade ATS' },
              { text: 'Análise de keywords da vaga' },
              { text: 'Download em PDF e DOCX' },
              { text: 'Pontos fortes e melhorias' },
            ]}
          />
          <PlanCard2 tag="PRO" name="Pro" tagline="Para quem aplica para várias vagas" price="29" cents="90" cta="Aumentar as chances" highlight
            features={[
              { text: '9 créditos de download de CV' },
              { text: 'Análises de vaga ilimitadas' },
              { text: 'Score de compatibilidade ATS' },
              { text: 'Análise de keywords da vaga' },
              { text: 'Download em PDF e DOCX' },
              { text: 'Pontos fortes e melhorias' },
              { text: 'Processamento prioritário' },
            ]}
          />
          <PlanCard2 tag="TURBO" name="Turbo" tagline="Para quem aplica todos os dias" price="59" cents="90" cta="Aplicar para mais vagas"
            features={[
              { text: '20 créditos de download de CV' },
              { text: 'Análises de vaga ilimitadas' },
              { text: 'Score de compatibilidade ATS' },
              { text: 'Análise de keywords da vaga' },
              { text: 'Download em PDF e DOCX' },
              { text: 'Pontos fortes e melhorias' },
              { text: 'Processamento prioritário' },
            ]}
          />
        </div>

        <div style={s.trustRow}>
          <span style={s.trustItem}><span style={s.tDot} /> Compatível com ATS usados por empresas como Gupy e LinkedIn</span>
          <span style={s.trustItem}><span style={s.tDot} /> Aumente suas chances de entrevista</span>
        </div>

        <div style={s.payStrip}>
          <span style={s.payIcon}>🔒</span>
          <span style={s.payText}>
            Pagamento seguro via <strong>Mercado Pago</strong> · Acesso imediato · Sem renovação automática
          </span>
        </div>
      </div>
    </div>
  );
}

const planosV2Styles = {
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
  navPill: { display: 'inline-flex', alignItems: 'center', gap: 8, background: '#fff', border: '1px solid rgba(10,10,10,0.08)', borderRadius: 999, padding: '5px 10px 5px 5px', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' },
  navAvatar: { width: 26, height: 26, borderRadius: '50%', background: '#0a0a0a', color: '#fafaf6', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600 },
  navChev: { fontSize: 9, color: '#8a8a85' },
  main: { padding: '48px 80px 60px', position: 'relative', zIndex: 2 },
  breadcrumb: { fontFamily: '"Geist Mono", monospace', fontSize: 10.5, letterSpacing: 1.2, color: '#8a8a85', marginBottom: 18, display: 'flex', gap: 10 },
  crumbMuted: { color: '#b0aeb4' },
  crumbSep: { color: '#c0beb4' },
  h1: { fontSize: 52, fontWeight: 500, letterSpacing: -2, lineHeight: 1.04, margin: '0 0 14px', textAlign: 'center' },
  em: { fontFamily: '"Instrument Serif", serif', fontStyle: 'italic', fontWeight: 400 },
  sub: { fontSize: 16, color: '#45443e', lineHeight: 1.55, textAlign: 'center', marginBottom: 32 },
  // Score widget
  scoreWidget: {
    display: 'flex', alignItems: 'center', flexWrap: 'wrap',
    background: '#fafaf6', border: '1px solid rgba(10,10,10,0.08)',
    borderRadius: 14, padding: '18px 28px', marginBottom: 28, gap: 0,
    boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
  },
  scoreItem: { flex: '0 0 auto', textAlign: 'center', padding: '0 28px' },
  scoreItemLabel: { fontFamily: '"Geist Mono", monospace', fontSize: 9.5, letterSpacing: 1, color: '#8a8a85', fontWeight: 500, marginBottom: 4 },
  scoreItemNum: { fontSize: 44, fontWeight: 500, letterSpacing: -2, fontVariantNumeric: 'tabular-nums', lineHeight: 1 },
  scoreDivider: { width: 1, height: 52, background: 'rgba(10,10,10,0.1)', margin: '0 4px' },
  scoreWidgetCta: { flex: 1, paddingLeft: 32, borderLeft: '1px solid rgba(10,10,10,0.08)', marginLeft: 12 },
  scoreWidgetHint: { fontSize: 14, color: '#3a3a38', lineHeight: 1.55 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, alignItems: 'start', marginBottom: 24, paddingTop: 12 },
  trustRow: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, marginBottom: 20 },
  trustItem: { display: 'inline-flex', alignItems: 'center', gap: 8, fontFamily: '"Geist Mono", monospace', fontSize: 11, color: '#6a6560', letterSpacing: 0.3 },
  tDot: { width: 6, height: 6, borderRadius: '50%', background: '#c6ff3a', display: 'inline-block' },
  payStrip: {
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
    padding: '14px 20px', background: '#fafaf6', border: '1px solid rgba(10,10,10,0.08)',
    borderRadius: 10,
  },
  payIcon: { fontSize: 14 },
  payText: { fontSize: 13.5, color: '#3a3a38' },
};

window.PlanosV2 = PlanosV2;
window.PlanosComScore = PlanosComScore;
