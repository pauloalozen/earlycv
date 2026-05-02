# Handoff: earlyCV — Telas 12–17 (novas)

## Overview

Pacote de implementação para **6 telas novas** do earlyCV, todas seguindo o sistema visual consolidado. Inclui código de referência em JSX, especificações completas de layout/tipografia/cores e componentes compartilhados prontos para reaproveitamento.

---

## About the Design Files

Os arquivos `.jsx` neste bundle são **referências de design em HTML + React inline (Babel)**. São protótipos visuais com fidelidade alta — não são código de produção para copiar diretamente.

A tarefa do desenvolvedor é **recriar essas telas no ambiente real do earlyCV** (Next.js + React + Tailwind ou similar), usando os padrões, componentes e convenções já existentes no projeto. O `index.html` serve para visualizar as telas rodando ao vivo no browser — abra com `python3 -m http.server 8000` ou `npx serve .`.

---

## Fidelity

**Hi-fi (alta fidelidade)** — valores finais, implementar pixel-perfect:
- Cores em hex/rgba exatos
- Tipografia definida (Geist + Geist Mono via Google Fonts)
- Espaçamentos, border-radius, shadows, estados de hover
- Ícone SVG do logo especificado com código exato

---

## Telas incluídas

| # | Tela | Arquivo | Dimensão base |
|---|------|---------|---------------|
| 12 | Pagamento Pendente | `pagamento.jsx → PagamentoPendente` | 1440 × 900 |
| 13 | Pagamento Confirmado | `pagamento.jsx → PagamentoConfirmado` | 1440 × 900 |
| 14 | Blog Index | `blog.jsx → BlogIndex` | 1440 × 900+ |
| 15 | Blog Artigo (Page 1) | `blog.jsx → BlogPage1` | 1440 × 1400+ |
| 16 | Palavras-chave (artigo longo) | `palavras-chave.jsx → PalavrasChave` | 1440 × 2200+ |
| 17 | Footer (componente) | `shared-components.jsx → SiteFooter` | 1440 × 380 |

---

## Componentes Compartilhados (`shared-components.jsx`)

Todos os componentes abaixo devem ser implementados **uma vez** no projeto real e reaproveitados em todas as telas.

### `<LogoIcon size dark />`
Ícone SVG do earlyCV — keywords grid.

```jsx
// SVG viewBox="0 0 40 32" — sempre usar essa proporção
// Light (bg claro): barras rgba(10,10,10,0.45) + verde #c6ff3a + dimmed rgba(10,10,10,0.18)
// Dark (bg escuro):  barras rgba(250,250,246,0.4) + verde #c6ff3a + dimmed rgba(250,250,246,0.12)
```

### `<LogoLockup dark size />`
Ícone + wordmark + badge de versão.
- `early` — Geist weight 300, tracking -0.5px
- `CV` — Geist weight 700, tracking -0.5px
- Badge `v1.2` — Geist Mono 10px, border #d8d6ce, radius 3px

### `<NavBar dark />`
Nav padrão com logo, links e CTA "Adaptar meu CV →". Props:
- `dark={true}` — bg #0a0a0a, texto em tons claros (usado no login split-panel)
- `dark={false}` — transparente, texto #3a3a38 (padrão)

### `<CtaBlock title sub kicker />`
Bloco de conversão inline — bg #0a0a0a, título, subtítulo, botão verde. Usado dentro de artigos e no meio de páginas longas.

### `<SiteFooter />`
Footer completo dark com CTA strip, 4 colunas de links e barra LGPD.

### `<Grain />`
Camada de grain SVG (position absolute, inset 0, multiply 0.5). Aplicar em todas as páginas.

---

## Screens / Views

### Tela 12 — Pagamento Pendente

**Arquivo:** `pagamento.jsx → PagamentoPendente`
**Propósito:** Informar que o pagamento está sendo processado (PIX/boleto).

**Layout:**
- Fundo: radial-gradient #f9f8f4 → #ecebe5 + Grain
- Nav: apenas LogoLockup centralizado, sem links
- Conteúdo: card centralizado vertical e horizontalmente
- Footer mono "© EarlyCV · 2026" absoluto, bottom 24px

**Card:**
- bg #fafaf6, border rgba(10,10,10,0.08), radius 18, padding 40px 44px, width 460px
- Shadow: `0 1px 2px rgba(0,0,0,0.03), 0 16px 40px -16px rgba(10,10,10,0.1)`
- Ícone: círculo 56×56, bg rgba(245,197,24,0.12), border rgba(245,197,24,0.25), SVG relógio stroke #f5c518

**Tipografia:**
- Título: 24px weight 500 tracking -0.8 color #0a0a0a
- Body: 14px color #5a5a55 line-height 1.6 max-width 340px
- Hint: Geist Mono 11px color #a0a098, max-width 320px
- Dots: 3× círculo 7×7 #f5c518, opacidades 1 / 0.5 / 0.25

**CTAs:**
- Primário "Abrir Pix novamente": bg #0a0a0a color #fafaf6 radius 10 padding 14px full-width
- Ghost "Voltar para minhas compras": transparente, underline offset 3, color #6a6560

---

### Tela 13 — Pagamento Confirmado

**Arquivo:** `pagamento.jsx → PagamentoConfirmado`
**Propósito:** Confirmar pagamento e oferecer downloads do CV.

**Card:** igual ao Pendente, mas:
- Ícone: círculo 56×56, bg rgba(198,255,58,0.18), border rgba(110,150,20,0.2), SVG check stroke #405410
- Título: "Pagamento confirmado!" 24px
- Body: "Seus créditos já estão disponíveis e seu CV já está liberado." color #45443e
- Divider: 1px rgba(10,10,10,0.06) entre texto e botões

**CTAs (stacked):**
1. "Baixar PDF" — bg #0a0a0a color #fafaf6 radius 10 padding 14px full-width
2. "Baixar DOCX" — bg #fff border rgba(10,10,10,0.15) radius 10 padding 13px full-width
3. "Voltar para análise e baixar depois" — ghost, underline, color #6a6560

---

### Tela 14 — Blog Index

**Arquivo:** `blog.jsx → BlogIndex`
**Propósito:** Listagem de artigos do blog.

**Layout:** max-width 860px centrado, padding 56px 40px 0

**Header:**
- Kicker: Geist Mono 10.5px "BLOG" tracking 1.2
- H1: 52px weight 500 tracking -2 line-height 1.04
- Sub: 16px color #45443e

**Featured card:**
- bg #fafaf6 border radius 14 padding 28px 32px
- Kicker com dot verde pulsante, título 28px, sub 15px, meta mono footer

**Grid de posts (3 colunas, gap 16px):**
- Cards bg #fafaf6 border radius 12 padding 18px 20px
- Header: pill categoria (Geist Mono 9.5px, bg rgba(10,10,10,0.05)) + "X min" direita
- Título 15.5px weight 500, tag mono 10px, sub 13px, slug + data no rodapé

**CTA Block inline** no final

---

### Tela 15 — Blog Artigo

**Arquivo:** `blog.jsx → BlogPage1`
**Propósito:** Leitura de artigo individual com CTA inline.

**Layout:** max-width 660px centrado, padding 56px 40px 0

**Estrutura:**
- Pill categoria no topo
- H1 artigo: 42px weight 500 tracking -1.6 line-height 1.05
- Meta: data + leitura em Geist Mono 11px, separador "·"
- Lead: 17px color #45443e line-height 1.6

**CTA Block** logo abaixo do lead (antes do conteúdo)

**Seções do artigo:**
- border-top 1px rgba(10,10,10,0.07) com padding-top 28px
- H2: 20px weight 500 tracking -0.6
- Body: 15px line-height 1.75 color #2a2a28

**Leituras relacionadas:** grid 2 colunas, cards de post menor

**CTA Block** repetido no final

**FAQ:**
- Título 22px weight 500
- Itens: border-top, Q 15.5px weight 500, A 14px color #45443e line-height 1.6

---

### Tela 16 — Palavras-chave (artigo longo)

**Arquivo:** `palavras-chave.jsx → PalavrasChave`
**Propósito:** Artigo SEO longo com seções, listas e role blocks.

**Layout:** max-width 720px centrado, padding 56px 40px 0

**Elementos específicos:**

**Area tags:** flex wrap, gap 8, cada tag: Geist Mono 11px, bg #fff, border rgba(10,10,10,0.12), radius 6, padding 5px 10px

**Role blocks (por cargo):**
- bg #fafaf6 border radius 12 padding 16px 18px
- Título cargo: 14.5px weight 600
- Tags de keyword: Geist Mono 11px, bg rgba(198,255,58,0.22), color #405410, border rgba(110,150,20,0.2), radius 5, padding 4px 8px

**CTAs inline:** 2× ao longo do artigo + 1 no final

---

### Tela 17 — Footer

**Arquivo:** `shared-components.jsx → SiteFooter`
**Propósito:** Footer global do site, dark.

**Estrutura:**
- bg #0a0a0a + Grain overlay
- **CTA Strip** (border-bottom rgba(250,250,246,0.06)): título 22px weight 500 + botão #fafaf6 bg
- **Links grid** (4 colunas, gap 40, padding 40px): labels Geist Mono 10px tracking 1.2 color #5a5a55; links 13.5px color #a0a098
- **Bottom bar** (border-top rgba(250,250,246,0.06)): "Dados protegidos conforme LGPD" + "EarlyCV © 2026" — Geist Mono 11px color #4a4a48

**Colunas:**
- PRODUTO: Análise gratuita, Adaptar currículo, Currículo ATS, Palavras-chave
- APRENDER: Blog, Como adaptar currículo, Currículo ATS (artigo), Palavras-chave (artigo)
- RECURSOS: Modelo de currículo ATS, Currículo para Gupy, Contato, Demo de resultado
- LEGAL: Privacidade, Termos de uso

---

## Design Tokens

```css
/* Cores principais */
--bg-main:    radial-gradient(ellipse 80% 60% at 50% 0%, #f9f8f4 0%, #ecebe5 100%);
--bg-card:    #fafaf6;
--bg-dark:    #0a0a0a;
--border:     rgba(10,10,10,0.08);
--border-solid: rgba(10,10,10,0.15);
--text-primary:   #0a0a0a;
--text-secondary: #45443e;
--text-muted:     #5a5a55;
--text-faint:     #8a8a85;
--text-on-dark:   #fafaf6;
--text-on-dark-muted: #a0a098;

/* Acento — uso restrito */
--accent:         #c6ff3a;
--accent-soft:    rgba(198,255,58,0.22);
--accent-border:  rgba(110,150,20,0.2);
--accent-text:    #405410;

/* Estados */
--warning:    #f5c518;
--warning-bg: rgba(245,197,24,0.12);
--success-bg: rgba(198,255,58,0.18);

/* Fontes */
--font-sans: 'Geist', -apple-system, system-ui, sans-serif;
--font-mono: 'Geist Mono', monospace;
--font-serif: 'Instrument Serif', serif;

/* Shapes */
--radius-sm:  6px;
--radius-md:  10-12px;
--radius-lg:  14-18px;
--radius-pill: 999px;

/* Shadows */
--shadow-card: 0 1px 2px rgba(0,0,0,0.03), 0 16px 40px -16px rgba(10,10,10,0.1);
--shadow-cta:  0 4px 12px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.08);
```

---

## SVG do Ícone (versão final)

```html
<!-- earlyCV icon · Keywords grid · v1.1 · viewBox 0 0 40 32 -->

<!-- LIGHT (uso em fundos claros) -->
<svg width="20" height="16" viewBox="0 0 40 32" fill="none">
  <!-- Row 1 -->
  <rect x="0"  y="0"  width="13" height="4" rx="1.5" fill="rgba(10,10,10,0.45)"/>
  <rect x="17" y="0"  width="10" height="4" rx="1.5" fill="rgba(10,10,10,0.45)"/>
  <rect x="31" y="0"  width="9"  height="4" rx="1.5" fill="#c6ff3a"/>
  <!-- Row 2 -->
  <rect x="0"  y="14" width="15" height="4" rx="1.5" fill="#c6ff3a"/>
  <rect x="19" y="14" width="21" height="4" rx="1.5" fill="rgba(10,10,10,0.45)"/>
  <!-- Row 3 -->
  <rect x="0"  y="28" width="8"  height="4" rx="1.5" fill="rgba(10,10,10,0.45)"/>
  <rect x="12" y="28" width="15" height="4" rx="1.5" fill="#c6ff3a"/>
  <rect x="31" y="28" width="9"  height="4" rx="1.5" fill="rgba(10,10,10,0.18)"/>
</svg>

<!-- DARK (uso em fundos #0a0a0a) -->
<!-- Trocar rgba(10,10,10,0.45) → rgba(250,250,246,0.4) -->
<!-- Trocar rgba(10,10,10,0.18) → rgba(250,250,246,0.12) -->
<!-- Manter #c6ff3a -->
```

---

## Implementação recomendada

**Stack sugerida:** Next.js + TypeScript + Tailwind CSS + shadcn/ui

**Ordem de implementação:**
1. `shared-components` — criar componentes globais primeiro: `LogoIcon`, `LogoLockup`, `NavBar`, `SiteFooter`, `CtaBlock`, `Grain`
2. `Footer` — aplicar em todas as páginas imediatamente
3. `Pagamento Pendente` + `Confirmado` — estados simples, bom pra começar
4. `Blog Index` — estrutura de listagem
5. `Blog Artigo` — template de artigo (reutilizado para todas as pages)
6. `Palavras-chave` — usa o mesmo template de artigo com elementos extras (role blocks, area tags)

**Fontes (Google Fonts):**
```html
<link href="https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500;600;700&family=Geist+Mono:wght@400;500&family=Instrument+Serif:ital@0;1&display=swap" rel="stylesheet">
```

---

## Files

- `index.html` — preview de todas as 6 telas (requer servidor HTTP)
- `shared-components.jsx` — LogoIcon, LogoLockup, NavBar, CtaBlock, SiteFooter, Grain
- `pagamento.jsx` — PagamentoPendente, PagamentoConfirmado
- `blog.jsx` — BlogIndex, BlogPage1
- `palavras-chave.jsx` — PalavrasChave
- `footer-page.jsx` — FooterPage (wrapper para visualização isolada do footer)

**Abrir localmente:**
```bash
cd handoff_telas_novas
python3 -m http.server 8000
# abrir http://localhost:8000
```
