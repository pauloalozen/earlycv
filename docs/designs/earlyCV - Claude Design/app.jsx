// ========== APP ==========

function App() {
  return (
    <DesignCanvas>
      {/* Header */}
      <div style={{ padding: '0 60px 32px' }}>
        <div style={{
          fontFamily: '"Geist Mono", monospace', fontSize: 11,
          letterSpacing: 1.2, color: '#8a8a85', marginBottom: 10,
        }}>
          EARLYCV · AVALIAÇÃO VISUAL · 2026-04-17
        </div>
        <div style={{
          fontSize: 38, fontWeight: 500, letterSpacing: -1.2,
          color: '#2a2620', lineHeight: 1.05, marginBottom: 12,
          maxWidth: 820,
        }}>
          <em style={{ fontFamily: '"Instrument Serif", serif', fontWeight: 400 }}>Antes</em> vs <em style={{ fontFamily: '"Instrument Serif", serif', fontWeight: 400 }}>depois</em>, aplicado em todo o fluxo.
        </div>
        <div style={{
          fontSize: 15, color: '#6a6560', maxWidth: 760, lineHeight: 1.55,
        }}>
          Direção "premium elegante", com o mesmo vocabulário aplicado em 4 telas:
          Landing, Login, Adaptar e uma tela nova de Resultado (ATS Widget real).
          Role/arraste para navegar.
        </div>
      </div>

      <DCSection title="1. Landing page" subtitle="Hero com widget animado · prova social · hierarquia editorial.">
        <DCArtboard label="01 · ANTES" width={1440} height={900}>
          <LandingBefore />
        </DCArtboard>
        <DCArtboard label="02 · DEPOIS" width={1440} height={900}>
          <LandingAfter />
        </DCArtboard>
      </DCSection>

      <DCSection title="2. Login" subtitle="Split-panel: 'brand side' escura com receipt técnico · form limpo à direita.">
        <DCArtboard label="03 · ANTES" width={1440} height={900}>
          <LoginBefore />
        </DCArtboard>
        <DCArtboard label="04 · DEPOIS" width={1440} height={900}>
          <LoginAfter />
        </DCArtboard>
      </DCSection>

      <DCSection title="3. Adaptar" subtitle="Passos numerados em mono · preview do que o usuário vai receber à direita.">
        <DCArtboard label="05 · ANTES" width={1440} height={900}>
          <AdaptarBefore />
        </DCArtboard>
        <DCArtboard label="06 · DEPOIS" width={1440} height={900}>
          <AdaptarAfter />
        </DCArtboard>
      </DCSection>

      <DCSection title="4. Resultado (novo)" subtitle="Tela que ainda não existe — é onde a marca brilha. Score, issues, diff.">
        <DCArtboard label="07 · PROPOSTA" width={1440} height={980}>
          <ResultadoAfter />
        </DCArtboard>
      </DCSection>

      {/* Notes section */}
      <div style={{ padding: '0 60px 60px', maxWidth: 1400 }}>
        <div style={{
          fontSize: 22, fontWeight: 600, letterSpacing: -0.3,
          color: '#2a2620', marginBottom: 20,
        }}>
          Sistema visual consolidado
        </div>

        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20,
        }}>
          <Note num="TIPO" title="Par tipográfico"
            body="Geist (sans serious, próxima a Söhne) para corpo e títulos + Geist Mono para kickers, labels e detalhes técnicos + Instrument Serif italic para ênfase editorial em palavras-chave."
          />
          <Note num="COR" title="Paleta sóbria"
            body="Off-white oklch quente (#f9f8f4 → #ecebe5 radial gradient). Preto profundo não-puro (#0a0a0a). Verde neon #c6ff3a usado só como SINAL: logo-mark, live dot, gauge >80, keywords detectadas, diff '+ depois'."
          />
          <Note num="SHAPE" title="Raios e densidade"
            body="Cards 12-14px · botões 8-10px · badges/pills 6-8px · dots 99px. Padding interno generoso em cards-herói (22-28px), apertado em linhas-de-dados (8-12px)."
          />
          <Note num="RITMO" title="Micro-detalhes mono"
            body="Todo metadado, label, caption, breadcrumb, footer e status é em Geist Mono. Dá tom 'feito por engenheiros' sem gritar. Labels em UPPERCASE + letter-spacing 1.2."
          />
          <Note num="MOVIMENTO" title="Animações"
            body="Hero: score anima 34→92 em loop (mostra o produto). Live dots pulsam. CTA arrow translateX(4px) no hover. Transições 120-240ms, easing ease-out."
          />
          <Note num="TEXTURA" title="Grain sutil"
            body="SVG feTurbulence em multiply, opacity 0.5. Remove o feel 'bootstrap default' sem chamar atenção. Combinado com radial gradient, dá profundidade sem sombras pesadas."
          />
          <Note num="LOGO" title="Marca atualizada"
            body="Wordmark 'earlyCV' + square-mark preto com corner-highlight verde (inset shadow). Sempre acompanhado de 'v1.2' em mono — posiciona como ferramenta viva, em evolução."
          />
          <Note num="HIERARQUIA" title="Escala tipográfica"
            body="H1 52-72px weight 500 tracking -2.2. Body 15-17px. Mono 10-11px para tudo secundário. Números grandes 26-76px tabular-nums para dados (score, métricas)."
          />
          <Note num="NEXT" title="Próximos passos"
            body="Design de estados (loading, empty, erro). Mobile. Ilustração opcional de CV no Login. Sistema de notificações. Paginação do histórico. Tudo já com o vocabulário estabelecido."
          />
        </div>
      </div>
    </DesignCanvas>
  );
}

function Note({ num, title, body }) {
  return (
    <div style={{
      background: '#fafaf6',
      border: '1px solid rgba(10,10,10,0.08)',
      borderRadius: 10,
      padding: '18px 20px',
    }}>
      <div style={{
        fontFamily: '"Geist Mono", monospace',
        fontSize: 10, letterSpacing: 1.2, color: '#8a8a85',
        marginBottom: 8, fontWeight: 500,
      }}>{num}</div>
      <div style={{
        fontSize: 15, fontWeight: 600, color: '#0a0a0a',
        marginBottom: 6, letterSpacing: -0.2,
      }}>{title}</div>
      <div style={{ fontSize: 13, color: '#4a4a45', lineHeight: 1.55 }}>
        {body}
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
