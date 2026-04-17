# 2026-04-16-landingpage-teste-animated-dots-design.md

## Overview
Copia landing atual (/page.tsx) para /landingpage-teste com fundo animado canvas pontos cinza claros (#E5E5E5) passando lento (Grok-like stars: 80-120 pontos, velocidade 0.5px/frame, fade alpha, slight x drift, random spawn top → bottom reset). Reutiliza hero FlipWord, CTA /adaptar, header, SEO. Noindex test.

## Metrics/Constraints
- Canvas fixed z-[-1] full, performance 60fps RAF.
- Dots: radius 1-2px, opacity 0.3-0.8 random, velocity y 0.3-0.8px/frame, x drift ±0.2.
- No interaction, subtle (não distrair CTA).
- Mobile OK (reduce count 60 dots).
- Clean visual: bg #FAFAFA + dots.

## Architecture
- landingpage-teste/page.tsx: Copy + <AnimatedDots /> before main.
- components/ui/animated-dots.tsx: Canvas hook (useRef, useEffect RAF loop, resize listener). Array particles {x,y,vx,vy,life}.
- No new deps. Reuse Tailwind globals.css if needed.
- Test: Snapshot canvas render, perf  <5% CPU.

## Components
- AnimatedDots: Props none. Internal loop spawn/reset, draw ctx.fillRect or circle.
- Landing: Same metadata (noindex add), header, hero, CTA.

## Success
- Dots passam suave sem lag.
- Hero/CTA intacto.
- Conversão foco (não distrair).

Commit spec. Aprovado.