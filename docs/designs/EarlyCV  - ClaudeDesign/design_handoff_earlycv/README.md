# Handoff: earlyCV — Redesign visual "premium elegante"

## Overview

Redesign visual do sistema **earlyCV** (SaaS brasileiro de adaptação de CV para filtros ATS). O objetivo foi elevar a percepção da marca de "minimalista genérico" para **"premium elegante e técnico"** — mantendo a essência séria/minimalista mas adicionando personalidade, hierarquia e sinais de credibilidade.

4 telas entregues: **Landing**, **Login**, **Adaptar CV** (entrada do fluxo) e **Resultado** (tela nova que não existia).

---

## About the Design Files

Os arquivos neste bundle são **referências de design criadas em HTML + React inline (JSX via Babel)** — são protótipos visuais mostrando o look & feel e comportamento pretendidos. **Não são código de produção para copiar direto.**

A tarefa do desenvolvedor é **recriar esses designs no ambiente real do earlyCV** (presumivelmente Next.js/React + Tailwind ou similar) usando os padrões, biblioteca de componentes e convenções que já existem no projeto. Se ainda não houver sistema estabelecido, escolher o framework mais adequado e implementar seguindo boas práticas.

O HTML serve como fonte de verdade visual: **cores, tipografia, espaçamento, hierarquia e interações estão precisos**; a implementação técnica deve se adaptar ao stack real.

---

## Fidelity

**Hi-fi (alta fidelidade)** — todos os valores são finais e devem ser implementados pixel-perfect:
- cores em hex exato
- tipografia definida (Geist + Geist Mono + Instrument Serif via Google Fonts)
- espaçamentos, border-radius, shadows, border
- estados de hover/focus/active descritos
- animações com duração e easing

---

## Screens / Views

### 1. Landing Page

**Arquivo:** `landing-after.jsx`
**Propósito:** atrair visitantes, explicar o produto em <5s, conversão para "Adaptar meu CV".

**Layout:**
- 1440 × 900 (desktop-first, ajustar para responsivo)
- Nav superior (altura ~60px, padding 20px 32px, border-bottom sutil rgba(0,0,0,0.04))
- Hero grid 2 colunas (1.05fr 0.95fr, gap 60px, padding 70px 80px 40px)
- Stripe de prova social absoluto no bottom (left/right 80px, bottom 96px)
- Footer absoluto (bottom 24px)
- Helper circle absoluto bottom-left 24/24

**Componentes principais:**

**Nav:**
- Logo: square-mark 18×18 preto (#0a0a0a) com corner-highlight via `box-shadow: inset -2px -2px 0 rgba(198,255,58,0.85)` + wordmark "earlyCV" (17px, weight 600, tracking -0.4) + badge "v1.2" em mono (10px, border 1px #d8d6ce, padding 1px 5px, radius 3px)
- Links: "Como funciona", "Preços", "Sobre" — 13px weight 450 #3a3a38, gap 28px
- CTA secundário: "Entrar" (transparente, 13px weight 500)
- CTA primário: "Começar grátis →" (bg #0a0a0a, color #fff, radius 8, padding 9px 14px, 12.5px weight 500, shadow leve)

**Hero esquerda:**
- Kicker pill: `• FERRAMENTA · BASEADA NA VAGA` — Geist Mono 10.5px, letter-spacing 1.2, weight 500, bg rgba(10,10,10,0.04), border rgba(10,10,10,0.06), padding 6px 10px, radius 999; dot verde #c6ff3a 6×6 com glow
- H1: 72px weight 500 letter-spacing -2.6 line-height 0.98. Texto: "Um CV *ajustado* para cada vaga. Automático." — "ajustado" em Instrument Serif italic weight 400 tracking -1
- Sub: 17px line-height 1.55 color #45443e max-width 480px
- CTA row (gap 12px, margin-bottom 48px):
  - Primário: "Adaptar meu CV →" bg #0a0a0a color #fff radius 10 padding 14px 22px 14.5px weight 500 — hover: translateY(-1px) + shadow aumenta, arrow desloca 4px (transition 180-240ms)
  - Secundário: "Ver exemplo ao vivo" transparente com underline offset 4
- Meta row (pt 28px, border-top rgba(10,10,10,0.08)): 3 itens "30s / 87% / 12k+" com labels em mono 10.5px uppercase, separados por divisores 1×36px rgba(10,10,10,0.1)

**Hero direita — ATS Widget animado:**
- Card 440px bg #fafaf6 border 1px rgba(10,10,10,0.08) radius 14, shadow `0 1px 2px rgba(0,0,0,0.04), 0 24px 60px -20px rgba(10,10,10,0.18)`
- Window chrome (padding 11px 14px, bg #f0efe9, border-bottom rgba(10,10,10,0.06)): 3 dots 11×11 (red #ff5f57, yellow #febc2e, green #28c840) + título mono "cv-analysis.earlyCV" centralizado
- Body padding 22px 26px 26px
- Label mono "● ANALISANDO CV PARA VAGA · SENIOR DEV" com live dot pulsando
- Gauge circular 180×180: stroke "rail" #1a1a1a width 10, stroke "fill" #c6ff3a (se score≥80) ou #f5c518 (senão), raio 72, strokeLinecap round, rotation -90deg. Número central 54px weight 500 tracking -2.5, label mono "ATS SCORE" abaixo
- **Animação:** score interpola de 34 → 92 em 2.8s com easing cubic out, pausa 1.5s em 92, reseta para 34. RequestAnimationFrame em loop.
- Keywords grid 3×2 com 6 items (React, TypeScript, Node.js, AWS, CI/CD, GraphQL) — cada um 11px mono weight 500 padding 6px 8px radius 6. "Hit": bg rgba(198,255,58,0.25) color #405410 border rgba(110,150,20,0.2). "Miss": bg rgba(10,10,10,0.04) color #8a8a85
- Progress bar no fim: label mono "Ajustando seções / {pct}%", track 4px rgba(10,10,10,0.08), bar #0a0a0a width dinâmica

**Prova social strip:**
- Label mono "CANDIDATOS CONTRATADOS EM" 10px letter-spacing 1.2 color #8a8a85
- Logos como texto (sem imagens): Itaú · Nubank · Stone · iFood · Mercado Livre · Globo — 15px weight 500 color #2a2a28 opacity 0.72, separados por dots #c0beb4

**Footer:**
- Esquerda: mono "© earlyCV · 2026" 11px color #8a8a85
- Direita: links "Termos / Privacidade / Status" 12px color #6a6a66 gap 20px

---

### 2. Login

**Arquivo:** `login-after.jsx`
**Layout:** split-panel 1fr 1fr (1440 × 900)

**Painel esquerdo (bg #0a0a0a, color #f0efe9):**
- Padding 32px 56px, flex column
- Nav top: logo-mark (dot verde inset-shadow mantido) + "earlyCV" em #fafaf6 / meta "PT · BR" em mono
- Centro (max-width 440px):
  - Kicker mono "• ENTRAR"
  - H1 64px weight 500 tracking -2.5 line-height 0.98: "Bem-vindo *de volta.*" — "de volta." em Instrument Serif italic
  - Sub 15.5px color #a8a8a0 max ~440px
  - **Receipt técnico** (border-top rgba(250,250,246,0.12), pt 16): 3 linhas mono 11px
    - "SESSÃO / encrypted · tls 1.3"
    - "LAST LOGIN / há 3 dias · São Paulo"
    - "CVs SALVOS / 2 · última análise 87%"
  - Keys #7a7a74 letter-spacing 0.6 / values #d8d7cf
- Footer: 2 linhas mono 10.5px #6a6a64 — "© earlyCV · 2026" / "v1.2 · status ● operational"

**Painel direito (bg #fafaf6):**
- Form 380px centralizado
- Título "Entrar na conta" 28px weight 500 tracking -1
- Sub "Use seu email ou continue com Google." 14px color #6a6560
- **Ordem propositalmente: Google primeiro** — botão branco border #d8d6ce radius 10 padding 12px, logo G oficial em SVG (paths Google 4 cores)
- Divider: "OU COM EMAIL" em mono 9.5px letter-spacing 1.2 entre 2 lines 1px #d8d6ce
- Campos com labels em mono 10px letter-spacing 1:
  - "Email" input placeholder "seu@email.com"
  - "Senha" / link "Esqueci" em mono 10px underline. Input com ícone olho 👁
  - Altura input: padding 11px 13px, radius 8, border #d8d6ce, bg #fff, font 13.5px
- Checkbox custom "Manter conectado por 30 dias": box 16×16 radius 4 bg #0a0a0a com checkmark verde #c6ff3a (borda 1.5px)
- CTA principal: "Entrar →" bg #0a0a0a color #fafaf6 radius 10 padding 14px weight 500 com shadow
- Footer: "Não tem conta? [Criar grátis →]" link underline

---

### 3. Adaptar CV

**Arquivo:** `adaptar-after.jsx`
**Propósito:** formulário principal do produto — upload CV + colar vaga + analisar.

**Layout:** 1440 × 900, padding 48px 80px 40px, grid 1.2fr / 0.8fr gap 40px

**Nav:** igual landing, com breadcrumb mono no centro-direita "Início / Adaptar"

**Header (max-width 780, mb 44):**
- Kicker mono "• ANÁLISE · 30 SEGUNDOS"
- H1 52px weight 500 tracking -2: "Cole a vaga, envie seu CV. A gente mostra *exatamente* por que você é eliminado." — "exatamente" em Instrument Serif italic

**Coluna esquerda (form):**

Step 01 — Upload:
- Step head: badge numérico "01" (32×32 radius 8 bg #0a0a0a color #fafaf6 com número mono 13px) + título "Seu CV" 15px weight 500 + sub mono "PDF, DOC ou DOCX · até 5 MB"
- Drop area: border 1.5px dashed #d0ceC6 radius 14 padding 44px 20px text-center bg #fafaf6 — hover: border #0a0a0a + bg #f5f4ee (transição 120ms)
- Ícone upload (SVG arrow-up) 22×22 stroke 1.5 #0a0a0a
- Título 14px weight 500 "Arraste ou clique para enviar" + hint mono 11px "seu-cv.pdf · ou solte aqui"

Step 02 — Descrição da vaga:
- Step head idem, com link "colar exemplo" em mono 10.5px underline à direita
- Textarea wrap: bg #fafaf6 border #d8d6ce radius 12 padding 12px 14px
- Textarea: sem border, font Geist 13.5px min-height 120px line-height 1.55
- Meta footer (border-top 6px, pt 8): "{chars} / 8000" em mono 10.5px #8a8a85 + hint "⌘+V para colar"
- Limite 8000 chars aplicado no onChange

CTA:
- Full-width bg #0a0a0a color #fafaf6 radius 12 padding 15px 15px weight 500 "Analisar CV para essa vaga →"
- Hint mono 10.5px centralizado: "Grátis · sem cadastro obrigatório · resultado em segundos"

**Coluna direita (preview do output):**
- Label mono "O QUE VOCÊ VAI RECEBER" 10px letter-spacing 1.2 #8a8a85
- Card preto: bg #0a0a0a color #f0efe9 radius 14 padding 20px 22px
  - Header mono 10px "● RELATÓRIO PRÉVIA" com dot verde #c6ff3a
  - Título "Relatório de alinhamento" 18px weight 500 #fafaf6
  - 5 linhas key/value separadas por border-top rgba(250,250,246,0.08): ATS SCORE / KEYWORDS / VERBOS DE AÇÃO / FORMATAÇÃO / SUGESTÕES
  - Footer mono "Priv: seus dados não são usados para treinar modelos."
- 3 trust badges flex row: "tempo médio 30s" / "criptografia e2e" / "análises 12k+" — bg rgba(10,10,10,0.03) border rgba(10,10,10,0.06) radius 8

---

### 4. Resultado (tela nova)

**Arquivo:** `resultado-after.jsx`
**Propósito:** mostrar score, issues detectados, preview de ajustes propostos em diff.

**Layout:** 1440 × 980, padding 36px 64px 40px

**Nav:** com breadcrumb "Adaptar / Relatório #A3F9" + botões "Exportar PDF" (ghost) e "Aplicar ajustes →" (primário)

**Summary row (grid 1.25fr / 0.75fr, gap 40px, mb 40px):**

Esquerda:
- Kicker mono "• RELATÓRIO · SENIOR FULLSTACK · ITAÚ"
- H1 54px weight 500 tracking -2.2: "Seu CV está *quase lá.* Faltam 3 ajustes críticos." — "quase lá." em Instrument Serif italic
- Sub 16px color #45443e max 540px
- Meta row com 3 números (border-top pt 20): 11 itens / 3 ajustes críticos / 24s análise

Direita (gauge card):
- bg #0a0a0a color #fff radius 18 padding 24px 28px, shadow `0 24px 60px -20px rgba(10,10,10,0.4)`
- Label mono "● ATS SCORE · PÓS-AJUSTES"
- Gauge 220×220 com raio 96, stroke 12, fill verde #c6ff3a
- Número central 76px weight 500 tracking -3 #fafaf6 + mono "/ 100" abaixo
- Delta footer (border-top rgba(250,250,246,0.1)): "**+38** vs CV original" — número em verde #c6ff3a 22px

**Grid 1fr / 1fr (gap 24):**

Coluna issues:
- Label mono "ISSUES DETECTADOS"
- 5 cards Issue (cada um):
  - grid 28px / 1fr / auto, gap 12
  - Número mono 11px #8a8a85
  - Título 14px weight 500 + body 12.5px color #5a5a55
  - Badge mono 9.5px uppercase letter-spacing 1 padding 3px 7px radius 4
    - Severidade "critico": bg #0a0a0a color #fff, badge "CRÍTICO"
    - Severidade "bom": bg rgba(198,255,58,0.35) color #405410, badge "OK"
- Conteúdo: 01 keywords ausentes, 02 verbos fracos, 03 sem métricas (todos críticos); 04 ATS-safe, 05 ordem cronológica (ok)

Coluna diff preview:
- Label mono "PREVIEW DO AJUSTE · BULLET #1"
- Card com window chrome (igual widget da landing), título chrome "experience[0].bullets[2]"
- Body padding 16px 18px:
  - Section "− antes" (badge bg #fee2e2 color #991b1b): texto 13.5px line-height 1.55
  - Section "+ depois" (badge bg rgba(198,255,58,0.3) color #405410 border rgba(110,150,20,0.25)): texto weight 500 com `<mark>` verde rgba(198,255,58,0.35) em "CI/CD" e "GraphQL"
  - Footer dashed border-top: mono 10px "KEYWORDS ADICIONADAS: 2 · AÇÃO: arquitetei · MÉTRICA: 45→8min"
- CTA full-width "Aplicar todos os 3 ajustes →" + hint mono "Você revisa cada mudança antes de baixar o CV."

---

## Interactions & Behavior

- **Hero widget (Landing):** animação em loop infinito — score interpola 34→92 (2.8s cubic ease-out), pausa 1.5s, reseta
- **Live dots:** `@keyframes pulse` — opacity 1→0.55, scale 1→0.9, 1.4s infinite
- **CTA hover:** translateY(-1px) + box-shadow aumenta; arrow translateX(4px) (transitions 180ms e 240ms cubic-bezier(.3,.9,.4,1))
- **Upload drop area (Adaptar):** hover muda border para #0a0a0a e bg para #f5f4ee
- **Textarea counter (Adaptar):** limite 8000, aplicado via slice no onChange
- **Keywords dinâmicas (Landing widget):** React, TypeScript, Node.js sempre "hit". AWS hit se score>60. CI/CD hit se >70. GraphQL hit se >80.
- **Form validation (Login):** placeholder — usar padrão do projeto (campos email e senha obrigatórios)

---

## State Management

- Landing: `score` (useState, animado via requestAnimationFrame), `hover` (CTA)
- Login: campos controlados (email, senha, remember-me)
- Adaptar: `jobText` (controlado, max 8000 chars), `file` (drop/select), `fileHover`
- Resultado: dados recebidos da API de análise — `score`, `issues[]`, `diffs[]`, `metadata`

---

## Design Tokens

### Cores

```
/* Neutrals */
--bg-main: radial-gradient(ellipse 80% 60% at 50% 0%, #f9f8f4 0%, #ecebe5 100%);
--bg-card: #fafaf6;
--bg-chrome: #f0efe9;
--bg-dark: #0a0a0a;
--bg-dark-soft: #1a1a1a;
--border-soft: rgba(10,10,10,0.06);
--border: rgba(10,10,10,0.08);
--border-solid: #d8d6ce;
--border-dashed: #d0ceC6;

/* Text */
--text-primary: #0a0a0a;
--text-secondary: #45443e;
--text-tertiary: #6a6560;
--text-muted: #8a8a85;
--text-on-dark: #fafaf6;
--text-on-dark-muted: #a0a098;
--text-on-dark-subtle: #7a7a74;

/* Accent (uso PARCIMONIOSO — só para sinais de sucesso) */
--accent: #c6ff3a;
--accent-soft: rgba(198,255,58,0.25);
--accent-hit: rgba(198,255,58,0.35);
--accent-text-on-light: #405410;

/* Semantic */
--danger-bg: #fee2e2;
--danger-text: #991b1b;
--warning: #f5c518;
--success: #28c840;

/* Window chrome */
--chrome-red: #ff5f57;
--chrome-yellow: #febc2e;
--chrome-green: #28c840;
```

### Tipografia

**3 famílias via Google Fonts:**
- **Geist** (400, 500, 600, 700) — body, títulos
- **Geist Mono** (400, 500) — labels, metadados, técnicos
- **Instrument Serif** (italic) — ênfase editorial

```
--font-sans: 'Geist', -apple-system, system-ui, sans-serif;
--font-mono: 'Geist Mono', monospace;
--font-serif: 'Instrument Serif', serif;
```

**Escala:**
- H1 hero landing: 72px / weight 500 / tracking -2.6 / line-height 0.98
- H1 login: 64px / 500 / -2.5 / 0.98
- H1 adaptar: 52px / 500 / -2 / 1.02
- H1 resultado: 54px / 500 / -2.2 / 1.02
- Título card grande: 28px / 500 / -1
- Título secundário: 18px / 500 / -0.4
- Body: 15-17px / 400 / 1.55
- Body small: 13.5-14px / 400 / 1.5
- Label mono: 10-11px / 500 / letter-spacing 1-1.2
- Caption mono: 9.5-10.5px / 500 / letter-spacing 0.3-1.5

### Espaçamento

- Padding cards heróis: 22-28px
- Padding form inputs: 11-14px
- Gap entre cards: 20-40px
- Margin section: 44-48px
- Padding page: 32-80px horizontal, 20-70px vertical

### Border radius

- Pills/dots: 999px
- Inputs/botões pequenos: 8-10px
- Cards: 12-14px
- Cards grandes (gauge): 18px
- Badges: 3-6px

### Shadows

- Nav CTA: `0 1px 2px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.08)`
- CTA hover: `0 10px 24px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.08)`
- Card em destaque: `0 1px 2px rgba(0,0,0,0.04), 0 24px 60px -20px rgba(10,10,10,0.18)`
- Card preto: `0 24px 60px -20px rgba(10,10,10,0.4)`

### Textura

Grain sutil via SVG feTurbulence + multiply:
```html
<div style={{
  position:'absolute', inset:0, pointerEvents:'none', opacity:0.5,
  mixBlendMode:'multiply',
  backgroundImage:`url("data:image/svg+xml;utf8,<svg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.035 0'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>")`
}}/>
```

---

## Assets

Nenhum asset externo (imagens/ícones raster). Tudo é:
- **SVG inline** para logo-mark (box com inset shadow) e ícones (upload, Google G)
- **Emojis/unicode sutis** nos chrome dots e ícones de interface — considerar trocar por lucide-react ou Radix Icons no projeto real
- **Fontes** via Google Fonts link tag

---

## Recomendações de stack

Stack sugerida para implementação:
- **Next.js + React + TypeScript**
- **Tailwind CSS** para utilitários (configurar as tokens acima em `tailwind.config.ts`)
- **shadcn/ui** como base de componentes (Input, Button, Dialog, etc.) — substituir estilos para casar com o sistema
- **lucide-react** para ícones
- **Framer Motion** para as animações do hero widget (score, pulse, hover)

---

## Files

Referências HTML/JSX neste bundle:

- `index.html` — shell com imports React + Babel + fontes
- `landing-after.jsx` — Landing page final
- `login-after.jsx` — Login split-panel
- `adaptar-after.jsx` — Formulário de adaptação
- `resultado-after.jsx` — Relatório (tela nova)
- `landing-before.jsx`, `login-before.jsx`, `adaptar-before.jsx` — "antes" (estado atual) apenas para comparação; **não implementar**
- `design-canvas.jsx` — wrapper de apresentação; **ignorar na implementação**
- `app.jsx` — composição do canvas; **ignorar na implementação**

Abrir `index.html` em qualquer navegador para ver os protótipos rodando ao vivo com animações.
