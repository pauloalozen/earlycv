# Landing Variant C Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add landing variant C as variant A plus the guarantee and creator quote sections from variant B, keeping A/B behavior unchanged.

**Architecture:** Extend the variant resolver to support `C`, add a dedicated `LandingVariantC` component based on variant A, and branch rendering in the landing entrypoint. Keep content composition explicit in the new file to avoid cross-variant side effects.

**Tech Stack:** Next.js App Router, TypeScript, React, Vitest.

---

## File Structure

- Create: `apps/web/src/app/_landing/variant-c.tsx` - new hybrid landing variant (A base + B guarantee/founder blocks).
- Modify: `apps/web/src/app/_landing/variant.ts` - widen variant type and resolver support for `C`.
- Modify: `apps/web/src/app/page.tsx` - render `LandingVariantC` when variant is `C`.
- Modify: `apps/web/src/app/_landing/variant.test.ts` - add test assertion for `C` resolution.

### Task 1: Extend Variant Resolver for C

**Files:**
- Modify: `apps/web/src/app/_landing/variant.ts`
- Test: `apps/web/src/app/_landing/variant.test.ts`

- [ ] **Step 1: Write the failing test for C support**

Update `apps/web/src/app/_landing/variant.test.ts` to include `C`:

```ts
import { describe, expect, it } from "vitest";
import { resolveLandingVariant } from "./variant";

describe("resolveLandingVariant", () => {
  it("returns variant A by default", () => {
    expect(resolveLandingVariant(undefined)).toBe("A");
    expect(resolveLandingVariant("")).toBe("A");
    expect(resolveLandingVariant("invalid")).toBe("A");
  });

  it("accepts explicit variant values", () => {
    expect(resolveLandingVariant("A")).toBe("A");
    expect(resolveLandingVariant("B")).toBe("B");
    expect(resolveLandingVariant("C")).toBe("C");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web test apps/web/src/app/_landing/variant.test.ts`
Expected: FAIL because `resolveLandingVariant("C")` returns `"A"`.

- [ ] **Step 3: Implement minimal resolver change**

Replace `apps/web/src/app/_landing/variant.ts` with:

```ts
export type LandingVariant = "A" | "B" | "C";

export function resolveLandingVariant(
  rawVariant: string | undefined,
): LandingVariant {
  if (rawVariant === "B") return "B";
  if (rawVariant === "C") return "C";
  return "A";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter web test apps/web/src/app/_landing/variant.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit resolver/test change**

```bash
git add apps/web/src/app/_landing/variant.ts apps/web/src/app/_landing/variant.test.ts
git commit -m "feat(web): support landing variant C in resolver"
```

### Task 2: Add LandingVariantC Component

**Files:**
- Create: `apps/web/src/app/_landing/variant-c.tsx`

- [ ] **Step 1: Create variant-c from variant-a baseline**

Run:

```bash
cp apps/web/src/app/_landing/variant-a.tsx apps/web/src/app/_landing/variant-c.tsx
```

Expected: new file exists with the same baseline structure as variant A.

- [ ] **Step 2: Update imports and component name**

In `apps/web/src/app/_landing/variant-c.tsx`, apply these exact changes:

```ts
import Image from "next/image";
import Link from "next/link";
import React from "react";
import { Logo } from "@/components/logo";
import { PublicFooter } from "@/components/public-footer";
import { siteConfig } from "@/lib/site";
import { AtsWidget } from "../_ats-widget";
import { LandingNavAuth } from "../_landing-nav-auth";
import { LandingScrollAnimations } from "../_landing-scroll-animations";
import { buildPlanCatalog } from "../planos/plan-catalog";

export function LandingVariantC() {
  const plans = buildPlanCatalog(process.env);
```

- [ ] **Step 3: Insert guarantee + creator sections before final CTA**

In `apps/web/src/app/_landing/variant-c.tsx`, locate the final CTA section in A and insert the following two blocks immediately before it.

Guarantee block:

```tsx
      {/* ── Guarantee ── */}
      <section
        style={{
          background: "#fff",
          borderTop: "1px solid rgba(10,10,10,0.06)",
          borderBottom: "1px solid rgba(10,10,10,0.06)",
          padding: "80px 32px",
        }}
      >
        <div
          style={{
            maxWidth: 640,
            margin: "0 auto",
            textAlign: "center",
          }}
        >
          <p
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: 1.8,
              color: "#8a8a85",
              marginBottom: 18,
              textTransform: "uppercase",
            }}
          >
            Garantia de satisfação
          </p>

          <h3
            style={{
              fontSize: "clamp(26px, 4vw, 38px)",
              fontWeight: 500,
              letterSpacing: -1.2,
              lineHeight: 1.1,
              color: "#0a0a0a",
              margin: "0 0 16px",
            }}
          >
            Não ficou bom?{" "}
            <em
              style={{
                fontFamily: SERIF_ITALIC,
                fontStyle: "italic",
                fontWeight: 400,
              }}
            >
              Devolvemos seu dinheiro.
            </em>
          </h3>
          <p
            style={{
              fontSize: 16,
              color: "#5a5a55",
              lineHeight: 1.65,
              maxWidth: 440,
              margin: "0 auto 36px",
            }}
          >
            Sem formulário, sem burocracia. Se a adaptação não entregou valor,
            manda uma mensagem e o dinheiro volta.
          </p>

          <div
            style={{
              display: "flex",
              justifyContent: "center",
              gap: 20,
              flexWrap: "wrap",
              marginBottom: 36,
            }}
          >
            {[
              "Reembolso integral garantido",
              "Sem perguntas ou burocracia",
              "Resposta em até 24 horas",
            ].map((text) => (
              <span
                key={text}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 13.5,
                  color: "#0a0a0a",
                  fontWeight: 400,
                }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: "#c6ff3a",
                    flexShrink: 0,
                    display: "inline-block",
                  }}
                />
                {text}
              </span>
            ))}
          </div>

          <Link
            href="/adaptar"
            className="lp-cta-primary"
            style={{
              background: "#0a0a0a",
              color: "#fff",
              borderRadius: 10,
              padding: "14px 28px",
              fontSize: 15,
              fontWeight: 500,
              textDecoration: "none",
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              boxShadow:
                "0 4px 12px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.08)",
            }}
          >
            Testar grátis agora
            <span className="lp-cta-arrow">→</span>
          </Link>
        </div>
      </section>
```

Creator quote block:

```tsx
      {/* ── Founder ── */}
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "80px 32px" }}>
        <div
          style={{
            background: "rgba(255,255,255,0.7)",
            border: "1px solid rgba(10,10,10,0.08)",
            borderRadius: 16,
            padding: "28px 32px",
            display: "flex",
            gap: 20,
            alignItems: "flex-start",
            maxWidth: 620,
            margin: "0 auto",
            backdropFilter: "blur(6px)",
          }}
        >
          <Image
            src="/paulo-alozen.jpg"
            alt="Paulo Alozen"
            width={52}
            height={52}
            style={{
              borderRadius: "50%",
              objectFit: "cover",
              flexShrink: 0,
            }}
          />
          <div>
            <div
              style={{
                fontSize: 14,
                fontWeight: 500,
                color: "#0a0a0a",
                marginBottom: 2,
              }}
            >
              Paulo Alozen
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                fontSize: 12,
                color: "#8a8a85",
                marginBottom: 10,
              }}
            >
              Criador do EarlyCV
              <Link
                href="https://www.linkedin.com/in/pauloalozen/"
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  fontSize: 11,
                  color: "#5a5a55",
                  textDecoration: "none",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 3,
                  fontFamily: MONO,
                  letterSpacing: 0.3,
                  borderBottom: "1px solid rgba(10,10,10,0.18)",
                  paddingBottom: 1,
                }}
              >
                ↗ LinkedIn
              </Link>
            </div>
            <p
              style={{
                fontSize: 13,
                color: "#5a5a55",
                lineHeight: 1.65,
                fontStyle: "italic",
                margin: 0,
              }}
            >
              "Criei o EarlyCV depois de mandar o mesmo currículo para vagas
              diferentes e não passar em nenhuma triagem. Hoje uso essa mesma
              ferramenta para adaptar meu CV a cada vaga que realmente me
              interessa."
            </p>
          </div>
        </div>
      </div>
```

- [ ] **Step 4: Run targeted checks for type/lint safety**

Run: `pnpm --filter web lint`
Expected: PASS with no new lint/type issues introduced by `variant-c.tsx`.

- [ ] **Step 5: Commit variant C component**

```bash
git add apps/web/src/app/_landing/variant-c.tsx
git commit -m "feat(web): add landing variant C layout"
```

### Task 3: Wire Variant C in Landing Entrypoint

**Files:**
- Modify: `apps/web/src/app/page.tsx`

- [ ] **Step 1: Write failing behavior check**

Run app with variant C before wiring:

Run: `NEXT_PUBLIC_LANDING_VARIANT=C pnpm --filter web dev`
Expected: page still renders variant A (C not yet branched in `page.tsx`).

- [ ] **Step 2: Add import and branch for C**

Update `apps/web/src/app/page.tsx` to:

```tsx
import type { Metadata } from "next";
import { getAbsoluteUrl, siteConfig } from "@/lib/site";
import { resolveLandingVariant } from "./_landing/variant";
import { LandingVariantA } from "./_landing/variant-a";
import { LandingVariantB } from "./_landing/variant-b";
import { LandingVariantC } from "./_landing/variant-c";

export const metadata: Metadata = {
  title: "Seu CV ajustado para cada vaga",
  description:
    "Descubra o que está te eliminando nas vagas e receba um CV ajustado para aumentar suas chances de entrevista.",
  alternates: {
    canonical: getAbsoluteUrl("/"),
  },
  keywords: [
    ...siteConfig.keywords,
    "adaptar curriculo para vaga",
    "cv ajustado",
    "curriculo ats",
    "análise de currículo",
  ],
  openGraph: {
    url: getAbsoluteUrl("/"),
    title: "EarlyCV - Seu CV ajustado para cada vaga",
    description:
      "Descubra o que está te eliminando nas vagas e receba um CV ajustado para aumentar suas chances de entrevista.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "EarlyCV - Seu CV ajustado para cada vaga",
    description:
      "Descubra o que está te eliminando nas vagas e receba um CV ajustado para aumentar suas chances de entrevista.",
  },
};

export default function Home() {
  const variant = resolveLandingVariant(
    process.env.NEXT_PUBLIC_LANDING_VARIANT,
  );

  if (variant === "B") {
    return <LandingVariantB />;
  }

  if (variant === "C") {
    return <LandingVariantC />;
  }

  return <LandingVariantA />;
}
```

- [ ] **Step 3: Verify C route rendering manually**

Run: `NEXT_PUBLIC_LANDING_VARIANT=C pnpm --filter web dev`
Expected: landing shows A structure plus guarantee and creator sections before final CTA.

- [ ] **Step 4: Commit entrypoint branch**

```bash
git add apps/web/src/app/page.tsx
git commit -m "feat(web): route landing variant C from homepage"
```

### Task 4: Final Verification

**Files:**
- Verify: `apps/web/src/app/_landing/variant.ts`
- Verify: `apps/web/src/app/_landing/variant.test.ts`
- Verify: `apps/web/src/app/_landing/variant-c.tsx`
- Verify: `apps/web/src/app/page.tsx`

- [ ] **Step 1: Run focused variant tests**

Run: `pnpm --filter web test apps/web/src/app/_landing/variant.test.ts`
Expected: PASS including `C` support.

- [ ] **Step 2: Run project checks used by team for web app**

Run: `pnpm --filter web lint && pnpm --filter web build`
Expected: PASS.

- [ ] **Step 3: Manual visual verification across variants**

Run each command and inspect homepage:

```bash
NEXT_PUBLIC_LANDING_VARIANT=A pnpm --filter web dev
NEXT_PUBLIC_LANDING_VARIANT=B pnpm --filter web dev
NEXT_PUBLIC_LANDING_VARIANT=C pnpm --filter web dev
```

Expected:
- A unchanged
- B unchanged
- C = A base + guarantee + creator quote before final CTA

- [ ] **Step 4: Commit verification-safe final state (only if prior granular commits were skipped)**

```bash
git add apps/web/src/app/_landing/variant.ts apps/web/src/app/_landing/variant.test.ts apps/web/src/app/_landing/variant-c.tsx apps/web/src/app/page.tsx
git commit -m "feat(web): add landing variant C combining A structure with B trust sections"
```
