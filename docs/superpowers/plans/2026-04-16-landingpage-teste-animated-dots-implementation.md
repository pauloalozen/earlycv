# 2026-04-16-landingpage-teste-animated-dots-implementation.md

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Copy landing to /landingpage-teste + canvas background light gray dots passing (Grok-like, slow 0.5px/frame, 80-120 dots, fade, x drift).

**Architecture:** Canvas fixed z-[-1] full, RAF loop particles array spawn top/reset bottom. Reuse hero/CTA/header. New ui/animated-dots.tsx isolated. No deps. Mock canvas test.

**Tech Stack:** Next.js TSX, Canvas 2D, Tailwind, RAF, requestAnimationFrame, useRef/useEffect. Biome lint.

---

## File Structure
- Copy: apps/web/src/app/page.tsx → landingpage-teste/page.tsx
- Create: apps/web/src/components/ui/animated-dots.tsx (canvas hook)
- Modify: landingpage-teste/page.tsx (import + <AnimatedDots /> before main)
- Test: apps/web/src/components/ui/animated-dots.test.tsx (mock canvas)
- Update: apps/web/src/components/ui/index.ts export
- Docs: AGENTS.md UI canvas rule.

---

### Task 1: Copy landingpage-teste

**Files:**
- Bash copy
- apps/web/src/app/landingpage-teste/page.tsx

- [ ] **Step 1: Copy**
```bash
cp apps/web/src/app/page.tsx apps/web/src/app/landingpage-teste/page.tsx
```
- [ ] **Step 2: Update title/metadata noindex test**
Add `noindex` robots.
- [ ] **Step 3: Commit**
```bash
git add apps/web/src/app/landingpage-teste
git commit -m "feat: copy landing to landingpage-teste base"
```

### Task 2: AnimatedDots canvas component

**Files:**
- Create: apps/web/src/components/ui/animated-dots.tsx
- Test: animated-dots.test.tsx (vi.mock canvas)

- [ ] **Step 1: Failing test**
```tsx
test('renders canvas and animates dots', () => {
  render(<AnimatedDots />);
  expect(screen.getByRole('img')).toBeInTheDocument(); // canvas
});
```
- [ ] **Step 2: Run fail**
npm test ui/animated-dots.test.tsx
- [ ] **Step 3: Impl**
```tsx
"use client";
import { useEffect, useRef } from "react";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  alpha: number;
}

export function AnimatedDots() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let particles: Particle[] = [];
    let animationFrame: number;
    const numParticles = 100;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    const spawnParticle = () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * 0.4,
      vy: 0.5 + Math.random() * 0.6,
      radius: 1 + Math.random() * 1.5,
      alpha: 0.3 + Math.random() * 0.5,
    });

    for (let i = 0; i < numParticles; i++) {
      particles.push(spawnParticle());
    }

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#E5E5E5";

      particles.forEach((p, i) => {
        p.x += p.vx;
        p.y += p.vy;
        p.alpha = Math.max(0.2, p.alpha - 0.001);

        if (p.y > canvas.height) {
          particles[i] = spawnParticle();
          p.y = 0;
        }

        ctx.globalAlpha = p.alpha;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fill();
      });

      ctx.globalAlpha = 1;
      animationFrame = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      cancelAnimationFrame(animationFrame);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return <canvas ref={canvasRef} className="fixed inset-0 -z-10 pointer-events-none" />;
}
```
- [ ] **Step 4: Run test pass**
- [ ] **Step 5: Export index.ts, add showcase /ui**
- [ ] **Commit** "feat: ui/animated-dots canvas gray dots"

### Task 3: Integrate in landingpage-teste/page.tsx

**Files:**
- Modify: apps/web/src/app/landingpage-teste/page.tsx

- [ ] Test fail snapshot.
- [ ] Add import + <AnimatedDots /> top main bg-[#FAFAFA].
- [ ] Commit "feat: landingpage-teste with animated dots bg"

### Task 4: Lint/build/test/perf

- [ ] npm run check/build
- [ ] Test canvas render 60fps (devtools).
- [ ] Commit final.

**Verification:** Browser /landingpage-teste dots passing slow gray, no lag, hero intact. 

Plan complete. Use subagent-driven or inline? 1 or 2?