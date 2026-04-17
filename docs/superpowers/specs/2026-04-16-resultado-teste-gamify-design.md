# 2026-04-16-resultado-teste-gamify-design.md

## Overview
Enhance /adaptar/resultado gamification via new test route /adaptar/resultado-teste (exact copy first). Reuse 90% existing (cards, preview, table). Focus: Explicit +/- pts per metric/item for ATS score breakdown. Teaser blur numbers/tips, full paywall.

## Metrics (ATS-based, weighted total score)
1. **Keywords Match (30%)**: Vaga reqs/tech % in CV. Ex: 60% (missing Python,SQL).
2. **Skills Alignment (25%)**: Tech overlap + seniority match.
3. **Experience Relevance (20%)**: Recency (2-5y) + duration relevant roles.
4. **Quant Results (15%)**: Bullets with metrics (%/R$/size).
5. **ATS Format (10%)**: Sections order/length/tables-free.

AI Prompt update: JSON structured {score:72, metrics:{keywords:{match:60,missing:['Python']},...}, deltas:{exp:+25,keywords:-15,...}}

## Layout Sections
### 1. Header + Score (top)
- Vaga title/empresa same.
- Score 72/100 stacked bar segments (verde skills, vermelho keywords etc.).
- Subtitle dynamic: \"Sair 72→90 com 3 ajustes\".

### 2. Cards Breakdown
- **Pontos Fortes** (verde): List + total delta (+25 EXP).
- **Faltas** (vermelho): List + delta (-15 Keywords) + insert tips.
- **Melhorias** (verde): Otim CV highlights + delta (+18 total).

### 3. Keywords Table
- Cols: Palavra | Presente(✓ +pts verde) | Faltante(✗ -pts vermelho).
- Sortable, footer total delta.

### 4. Preview + CTA
- Side-by-side CV orig/otim: Highlights add(green), del(strike).
- Blur otim/deltas teaser.
- CTA download/plans same.

## Tech Changes
- Copy /adaptar/resultado → resultado-teste (page.tsx + deps).
- Props: analysis data with metrics/deltas.
- Components: MetricBar, DeltaBadge, KeywordTable (new/reuse ui).
- Responsive: Mobile stack bars/cards.

## Success Criteria
- No pisca (Suspense/skeleton).
- Gamify perceived value: User sees \"+18 pts easy\" → pay.
- SEO noindex.
- Tests: Snapshot metrics render, paywall blur.

Commit: docs/superpowers/specs/2026-04-16-resultado-teste-gamify-design.md