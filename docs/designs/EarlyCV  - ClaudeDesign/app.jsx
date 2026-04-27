// ========== APP — canvas completo ==========

function App() {
  return (
    <DesignCanvas>
      {/* ── Header ── */}
      <div style={{ padding: '0 60px 32px' }}>
        <div style={{ fontFamily: '"Geist Mono", monospace', fontSize: 11, letterSpacing: 1.2, color: '#8a8a85', marginBottom: 10 }}>
          EARLYCV · SISTEMA VISUAL COMPLETO · ABR 2026
        </div>
        <div style={{ fontSize: 38, fontWeight: 500, letterSpacing: -1.2, color: '#2a2620', lineHeight: 1.05, marginBottom: 10, maxWidth: 820 }}>
          Todas as telas — <em style={{ fontFamily: '"Instrument Serif", serif', fontWeight: 400 }}>antes vs depois</em> + novas.
        </div>
        <div style={{ fontSize: 15, color: '#6a6560', maxWidth: 760, lineHeight: 1.55 }}>
          Arraste para navegar · pinch/scroll para zoom · clique nas telas interativas (Dashboard com modal, Contato com botão copiar).
        </div>
      </div>

      {/* ── 1. Landing ── */}
      <DCSection title="1. Landing page" subtitle="Hero com ATS widget animado · prova social · hierarquia editorial.">
        <DCArtboard label="01 · ANTES" width={1440} height={900}><LandingBefore /></DCArtboard>
        <DCArtboard label="02 · DEPOIS" width={1440} height={900}><LandingAfter /></DCArtboard>
      </DCSection>

      {/* ── 2. Como Funciona ── */}
      <DCSection title="2. Como Funciona" subtitle="3 passos · cards com step elevado para o destaque central.">
        <DCArtboard label="03 · COMO FUNCIONA" width={1440} height={900}><ComoFunciona /></DCArtboard>
      </DCSection>

      {/* ── 3. Login ── */}
      <DCSection title="3. Login" subtitle="Split-panel escuro/claro · receipt técnico · Google primeiro.">
        <DCArtboard label="04 · ANTES" width={1440} height={900}><LoginBefore /></DCArtboard>
        <DCArtboard label="05 · DEPOIS" width={1440} height={900}><LoginAfter /></DCArtboard>
      </DCSection>

      {/* ── 4. Adaptar ── */}
      <DCSection title="4. Adaptar CV" subtitle="Passos numerados · preview do output à direita.">
        <DCArtboard label="06 · ANTES" width={1440} height={900}><AdaptarBefore /></DCArtboard>
        <DCArtboard label="07 · DEPOIS" width={1440} height={900}><AdaptarAfter /></DCArtboard>
      </DCSection>

      {/* ── 5. Resultado ── */}
      <DCSection title="5. Resultado (nova tela)" subtitle="Score gauge · issues · diff antes/depois de bullet.">
        <DCArtboard label="08 · RESULTADO" width={1440} height={980}><ResultadoAfter /></DCArtboard>
      </DCSection>

      {/* ── 6. Dashboard ── */}
      <DCSection title="6. Dashboard" subtitle="Dados reais do screenshot · KPIs · histórico · modal Ajustes Feitos (clicável).">
        <DCArtboard label="09 · DASHBOARD + MODAL" width={1440} height={1000}><DashboardV2 /></DCArtboard>
      </DCSection>

      {/* ── 7. Planos ── */}
      <DCSection title="7. Planos" subtitle="Versão sem score (acesso direto) · versão com score widget personalizado.">
        <DCArtboard label="10 · PLANOS — SEM SCORE" width={1440} height={1000}><PlanosV2 /></DCArtboard>
        <DCArtboard label="11 · PLANOS — COM SCORE" width={1440} height={1000}><PlanosComScore /></DCArtboard>
      </DCSection>

      {/* ── 8. Contato ── */}
      <DCSection title="8. Contato" subtitle="Tela minimal centrada · botão copiar email funcional.">
        <DCArtboard label="12 · CONTATO" width={1440} height={900}><Contato /></DCArtboard>
      </DCSection>

      {/* ── 9. Privacidade + Termos ── */}
      <DCSection title="9. Documentos legais" subtitle="Layout editorial · kicker mono · bloco de destaque · seções numeradas.">
        <DCArtboard label="13 · PRIVACIDADE" width={1440} height={1200}><Privacidade /></DCArtboard>
        <DCArtboard label="14 · TERMOS DE USO" width={1440} height={1400}><TermosDeUso /></DCArtboard>
      </DCSection>

      {/* ── Sistema visual ── */}
      <div style={{ padding: '0 60px 60px', maxWidth: 1400 }}>
        <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: -0.3, color: '#2a2620', marginBottom: 20 }}>
          Sistema visual consolidado
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
          <Token k="TIPO" title="Geist + Geist Mono + Instrument Serif" body="Sans séria para corpo, mono para metadados/labels, serif italic para ênfase editorial." />
          <Token k="COR" title="#c6ff3a só como sinal de sucesso" body="Off-white #f9f8f4→#ecebe5 radial · Preto #0a0a0a · Verde neon só em: logo-mark, live dot, gauge>80, diff '+depois', check." />
          <Token k="SHAPE" title="Raios controlados" body="Pills 999px · botões 8-10px · cards 12-16px · badges 3-6px. Grain SVG multiply 0.5 em todas as páginas." />
          <Token k="MONO" title="Padrão de metadados" body="UPPERCASE + letter-spacing 1-1.2 + Geist Mono para: kickers, labels, footers, breadcrumbs, contadores, IDs." />
          <Token k="GAUGE" title="ATS Score widget" body="SVG circle stroke. Rail #1a1a1a. Fill #c6ff3a se ≥80, #f5c518 se <80. Interpola 34→92 em 2.8s cubic-out, pausa 1.5s." />
          <Token k="SPLIT" title="Login split-panel" body="Esquerda: bg #0a0a0a com receipt técnico + Instrument Serif. Direita: #fafaf6 form. Google acima do email — reduz atrito." />
          <Token k="MODAL" title="Ajustes Feitos" body="Overlay blur 4px + rgba 0.45. Score boxes lado a lado (antes / depois). Diff com mark verde no texto ajustado." />
          <Token k="LEGAL" title="Páginas de documento" body="max-width 760px centrado · H1 46px · body 14px line-height 1.7 · highlight com border-left #0a0a0a 3px." />
        </div>
      </div>
    </DesignCanvas>
  );
}

function Token({ k, title, body }) {
  return (
    <div style={{ background: '#fafaf6', border: '1px solid rgba(10,10,10,0.08)', borderRadius: 10, padding: '16px 18px' }}>
      <div style={{ fontFamily: '"Geist Mono", monospace', fontSize: 10, letterSpacing: 1.2, color: '#8a8a85', marginBottom: 8, fontWeight: 500 }}>{k}</div>
      <div style={{ fontSize: 13.5, fontWeight: 600, color: '#0a0a0a', marginBottom: 5, letterSpacing: -0.2 }}>{title}</div>
      <div style={{ fontSize: 12.5, color: '#4a4a45', lineHeight: 1.55 }}>{body}</div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
