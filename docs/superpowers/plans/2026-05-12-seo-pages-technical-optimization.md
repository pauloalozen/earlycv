# SEO Pages Technical Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corrigir sinais técnicos de SEO nas páginas `/curriculo-ats`, `/palavras-chave-curriculo` e `/adaptar-curriculo-para-vaga` sem alterar o conteúdo principal dos artigos.

**Architecture:** Os dados continuam declarativos no registry de SEO pages (`apps/web/src/lib/seo-pages/pages/*.ts`) e a composição final de metadata fica centralizada no route handler (`apps/web/src/app/(seo)/[slug]/page.tsx`). Vamos ajustar tipos para suportar `seo.keywords` e `seo.ogImage`, garantir fallback seguro de imagem OG com URL absoluta, e manter FAQ visível + JSON-LD vindo da mesma fonte (`page.faq`).

**Tech Stack:** Next.js App Router (Metadata API), TypeScript, Node test runner (`node:test`), Biome.

---

## File Structure Map

- Modify: `apps/web/src/lib/seo-pages/types.ts`
  - Responsabilidade: ampliar o contrato de `SeoPageDefinition` para keywords e ogImage dentro de `seo`.
- Modify: `apps/web/src/app/(seo)/[slug]/page.tsx`
  - Responsabilidade: metadata final (title sanitization, canonical, keywords condicionais, OG/Twitter images absolutas, JSON-LD FAQ condicional).
- Modify: `apps/web/src/lib/site.ts`
  - Responsabilidade: garantir `siteConfig.ogImage` absoluto.
- Modify: `apps/web/src/lib/seo-pages/pages/curriculo-ats.ts`
  - Responsabilidade: metadados específicos, H1/H2/hero intro, FAQ oficial, links internos exatos.
- Modify: `apps/web/src/lib/seo-pages/pages/palavras-chave-curriculo.ts`
  - Responsabilidade: metadados específicos, H1/H2/hero intro, FAQ oficial, links internos exatos.
- Modify: `apps/web/src/lib/seo-pages/pages/adaptar-curriculo-para-vaga.ts`
  - Responsabilidade: metadados específicos, H1/H2/hero intro, FAQ oficial, links internos exatos.
- Modify: `apps/web/src/lib/seo-pages/pages.spec.ts`
  - Responsabilidade: testes de contrato para keywords/links/FAQ dos 3 slugs alvo.

### Task 1: Expandir contratos de tipo para SEO fields

**Files:**
- Modify: `apps/web/src/lib/seo-pages/types.ts`
- Test: `apps/web/src/lib/seo-pages/pages.spec.ts`

- [ ] **Step 1: Escrever teste que garante `seo.keywords` array e opcionalidade por página**

```ts
test("target seo pages expose page-level keywords arrays", () => {
  const targets = [
    getSeoPageBySlug("curriculo-ats"),
    getSeoPageBySlug("palavras-chave-curriculo"),
    getSeoPageBySlug("adaptar-curriculo-para-vaga"),
  ];

  for (const page of targets) {
    assert.ok(page);
    assert.ok(Array.isArray(page.seo.keywords));
    assert.ok((page.seo.keywords?.length ?? 0) > 0);
    const faq: { question: string; answer: string }[] | undefined = page.faq;
    assert.equal(faq === undefined || Array.isArray(faq), true);
  }
});
```

- [ ] **Step 2: Rodar teste para validar falha inicial**

Run: `npm run test --workspace @earlycv/web -- apps/web/src/lib/seo-pages/pages.spec.ts`
Expected: FAIL com erro de propriedade ausente (`keywords` não existente em `seo`) ou assertions de array.

- [ ] **Step 3: Implementar atualização de tipo mínima**

```ts
seo: {
  description: string;
  title: string;
  keywords?: string[];
  ogImage?: string;
};
faq?: Array<{
  question: string;
  answer: string;
}>;
```

- [ ] **Step 4: Rodar teste novamente**

Run: `npm run test --workspace @earlycv/web -- apps/web/src/lib/seo-pages/pages.spec.ts`
Expected: ainda pode falhar até Task 3 (dados), mas sem erro de tipagem de contrato.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/seo-pages/types.ts apps/web/src/lib/seo-pages/pages.spec.ts
git commit -m "chore(seo): extend page seo types for keywords and og image"
```

### Task 2: Blindar `generateMetadata` (title, keywords condicionais, OG absoluta)

**Files:**
- Modify: `apps/web/src/app/(seo)/[slug]/page.tsx`
- Modify: `apps/web/src/lib/site.ts`

- [ ] **Step 1: Escrever helper testável para sanitize de title no arquivo de rota**

```ts
function sanitizeSeoTitle(rawTitle: string) {
  return rawTitle.replace(/(\s*\|\s*EarlyCV\s*)+$/u, "").trim();
}
```

- [ ] **Step 2: Implementar montagem de OG image absoluta**

```ts
const ogImage = page.seo.ogImage
  ? getAbsoluteUrl(page.seo.ogImage)
  : siteConfig.ogImage;
```

- [ ] **Step 3: Garantir que `siteConfig.ogImage` seja URL absoluta**

```ts
ogImage:
  process.env.NEXT_PUBLIC_OG_IMAGE_URL ||
  `${process.env.NEXT_PUBLIC_SITE_URL || "https://www.earlycv.com.br"}/og-image.png`,
```

- [ ] **Step 4: Atualizar retorno de metadata com regras condicionais**

```ts
return {
  alternates: { canonical },
  description: page.seo.description,
  ...(page.seo.keywords ? { keywords: page.seo.keywords } : {}),
  openGraph: {
    description: page.seo.description,
    images: [{ url: ogImage }],
    title: sanitizeSeoTitle(page.seo.title),
    type: "website",
    url: canonical,
  },
  robots: { follow: true, index: true },
  title: sanitizeSeoTitle(page.seo.title),
  twitter: {
    card: "summary_large_image",
    description: page.seo.description,
    images: [ogImage],
    title: sanitizeSeoTitle(page.seo.title),
  },
};
```

- [ ] **Step 4a: Garantir implementação do FAQ JSON-LD baseada em `page.faq`**

Verificar em `apps/web/src/app/(seo)/[slug]/page.tsx`:
- Se já existir JSON-LD de FAQ: manter leitura de `page.faq` e garantir que o bloco FAQ visível também lê da mesma `page.faq`.
- Se não existir: implementar renderização condicional no componente de página (fora de `generateMetadata`):

```tsx
{page.faq && page.faq.length > 0 && (
  <script
    type="application/ld+json"
    dangerouslySetInnerHTML={{
      __html: JSON.stringify({
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: page.faq.map((item) => ({
          "@type": "Question",
          name: item.question,
          acceptedAnswer: {
            "@type": "Answer",
            text: item.answer,
          },
        })),
      }),
    }}
  />
)}
```

Regra obrigatória: FAQ visível e FAQ JSON-LD devem usar a mesma fonte (`page.faq`) sem duplicar dados em estruturas paralelas.

- [ ] **Step 5: Validar que FAQ JSON-LD e FAQ visível continuam condicionais por `page.faq`**

Run: `npm run test --workspace @earlycv/web -- apps/web/src/lib/seo-pages/pages.spec.ts`
Expected: PASS para contratos existentes; sem regressão no build TS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/(seo)/[slug]/page.tsx apps/web/src/lib/site.ts
git commit -m "fix(seo): sanitize metadata title and enforce absolute og images"
```

### Task 3: Atualizar conteúdo SEO de `/curriculo-ats`

**Files:**
- Modify: `apps/web/src/lib/seo-pages/pages/curriculo-ats.ts`
- Test: `apps/web/src/lib/seo-pages/pages.spec.ts`

- [ ] **Step 1: Escrever teste de contrato para keywords + anchors + FAQ da página**

```ts
test("curriculo-ats keeps required seo contract", () => {
  const page = getSeoPageBySlug("curriculo-ats");
  assert.ok(page);

  assert.deepEqual(page.seo.keywords, [
    "currículo ats",
    "curriculo ats",
    "criar currículo ats",
    "curriculo ats modelo",
    "currículo compatível com ats",
    "ats currículo",
  ]);

  assert.equal(
    page.relatedLinks.some(
      (link) =>
        link.href === "/palavras-chave-curriculo" &&
        link.label === "palavras-chave para currículo",
    ),
    true,
    "missing link to palavras-chave-curriculo",
  );

  assert.equal(
    page.relatedLinks.some(
      (link) =>
        link.href === "/adaptar-curriculo-para-vaga" &&
        link.label === "adaptar currículo para cada vaga",
    ),
    true,
    "missing link to adaptar-curriculo-para-vaga",
  );

  assert.equal(page.faq?.length, 3);
});
```

- [ ] **Step 2: Rodar teste para falhar antes da implementação**

Run: `npm run test --workspace @earlycv/web -- apps/web/src/lib/seo-pages/pages.spec.ts`
Expected: FAIL por divergência de keywords/links/faq.

- [ ] **Step 3: Implementar ajustes da página**

Aplicar em `curriculo-ats.ts`:
- `seo.description` com texto final de CTR.
- `seo.keywords` como array de strings.
- `hero.title` contendo `currículo ATS` ou `currículo compatível com ATS` uma vez.
- `hero.description` com keyword principal dentro dos primeiros 100 caracteres.
- pelo menos um `sections[].heading` com variação da keyword principal.
- `faq` com exatamente 3 Q/A oficiais.
- `relatedLinks` com anchors exatos:
  - `palavras-chave para currículo` -> `/palavras-chave-curriculo`
  - `adaptar currículo para cada vaga` -> `/adaptar-curriculo-para-vaga`

- [ ] **Step 4: Rodar teste após implementação**

Run: `npm run test --workspace @earlycv/web -- apps/web/src/lib/seo-pages/pages.spec.ts`
Expected: PASS para assertivas da página `curriculo-ats`.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/seo-pages/pages/curriculo-ats.ts apps/web/src/lib/seo-pages/pages.spec.ts
git commit -m "feat(seo): refresh curriculo-ats metadata links and faq"
```

### Task 4: Atualizar conteúdo SEO de `/palavras-chave-curriculo`

**Files:**
- Modify: `apps/web/src/lib/seo-pages/pages/palavras-chave-curriculo.ts`
- Test: `apps/web/src/lib/seo-pages/pages.spec.ts`

- [ ] **Step 1: Escrever teste de contrato para página hub alvo**

```ts
test("palavras-chave-curriculo keeps required seo contract", () => {
  const page = getSeoPageBySlug("palavras-chave-curriculo");
  assert.ok(page);

  assert.deepEqual(page.seo.keywords, [
    "palavras chave para curriculo",
    "palavras chaves para curriculo",
    "palavras-chave currículo ats",
    "palavras chave currículo",
    "termos para currículo",
  ]);

  assert.equal(
    page.relatedLinks.some(
      (link) =>
        link.href === "/curriculo-ats" &&
        link.label === "currículo compatível com ATS",
    ),
    true,
    "missing link to curriculo-ats",
  );

  assert.equal(
    page.relatedLinks.some(
      (link) =>
        link.href === "/adaptar-curriculo-para-vaga" &&
        link.label === "adaptar o currículo para a vaga",
    ),
    true,
    "missing link to adaptar-curriculo-para-vaga",
  );

  assert.equal(page.faq?.length, 3);
});
```

- [ ] **Step 2: Rodar teste para validar falha inicial**

Run: `npm run test --workspace @earlycv/web -- apps/web/src/lib/seo-pages/pages.spec.ts`
Expected: FAIL por divergências da página.

- [ ] **Step 3: Implementar ajustes da página**

Aplicar em `palavras-chave-curriculo.ts`:
- `seo.description` com texto final de CTR.
- `seo.keywords` array conforme spec.
- `hero.title` com `palavras-chave para currículo`.
- `hero.description` com keyword principal nos primeiros 100 caracteres.
- ao menos 1 H2 com variação aceitável.
- `faq` exatamente com 3 Q/A oficiais.
- `relatedLinks` com anchors exatos:
  - `currículo compatível com ATS` -> `/curriculo-ats`
  - `adaptar o currículo para a vaga` -> `/adaptar-curriculo-para-vaga`

- [ ] **Step 4: Rodar teste após implementação**

Run: `npm run test --workspace @earlycv/web -- apps/web/src/lib/seo-pages/pages.spec.ts`
Expected: PASS para assertivas da página `palavras-chave-curriculo`.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/seo-pages/pages/palavras-chave-curriculo.ts apps/web/src/lib/seo-pages/pages.spec.ts
git commit -m "feat(seo): refresh palavras-chave-curriculo metadata links and faq"
```

### Task 5: Atualizar conteúdo SEO de `/adaptar-curriculo-para-vaga`

**Files:**
- Modify: `apps/web/src/lib/seo-pages/pages/adaptar-curriculo-para-vaga.ts`
- Test: `apps/web/src/lib/seo-pages/pages.spec.ts`

- [ ] **Step 1: Escrever teste de contrato para página de adaptação**

```ts
test("adaptar-curriculo-para-vaga keeps required seo contract", () => {
  const page = getSeoPageBySlug("adaptar-curriculo-para-vaga");
  assert.ok(page);

  assert.deepEqual(page.seo.keywords, [
    "adaptar currículo para vaga",
    "adaptar curriculo",
    "como adaptar currículo",
    "currículo por vaga",
    "personalizar currículo",
  ]);

  assert.equal(
    page.relatedLinks.some(
      (link) =>
        link.href === "/curriculo-ats" &&
        link.label === "currículo ATS",
    ),
    true,
    "missing link to curriculo-ats",
  );

  assert.equal(
    page.relatedLinks.some(
      (link) =>
        link.href === "/palavras-chave-curriculo" &&
        link.label === "palavras-chave certas",
    ),
    true,
    "missing link to palavras-chave-curriculo",
  );

  assert.equal(page.faq?.length, 3);
});
```

- [ ] **Step 2: Rodar teste para validar falha inicial**

Run: `npm run test --workspace @earlycv/web -- apps/web/src/lib/seo-pages/pages.spec.ts`
Expected: FAIL por divergências da página.

- [ ] **Step 3: Implementar ajustes da página**

Aplicar em `adaptar-curriculo-para-vaga.ts`:
- `seo.description` com texto final de CTR.
- `seo.keywords` array conforme spec.
- `hero.title` contendo `adaptar currículo para vaga`.
- `hero.description` com keyword principal nos primeiros 100 caracteres.
- ao menos 1 H2 com variação aceitável da keyword.
- `faq` exatamente com 3 Q/A oficiais.
- `relatedLinks` com anchors exatos:
  - `currículo ATS` -> `/curriculo-ats`
  - `palavras-chave certas` -> `/palavras-chave-curriculo`

- [ ] **Step 4: Rodar teste após implementação**

Run: `npm run test --workspace @earlycv/web -- apps/web/src/lib/seo-pages/pages.spec.ts`
Expected: PASS para assertivas da página `adaptar-curriculo-para-vaga`.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/seo-pages/pages/adaptar-curriculo-para-vaga.ts apps/web/src/lib/seo-pages/pages.spec.ts
git commit -m "feat(seo): refresh adaptar-curriculo-para-vaga metadata links and faq"
```

### Task 6: Verificação final end-to-end dos 3 slugs

**Files:**
- Verify only: `apps/web/src/app/(seo)/[slug]/page.tsx`
- Verify only: `apps/web/src/lib/seo-pages/pages/*.ts`

- [ ] **Step 1: Rodar suíte de testes do módulo seo-pages**

Run: `npm run test --workspace @earlycv/web -- apps/web/src/lib/seo-pages/*.spec.ts`
Expected: PASS.

- [ ] **Step 2: Rodar check de qualidade no workspace web**

Run: `npm run check --workspace @earlycv/web`
Expected: PASS sem erro de TypeScript/Biome.

- [ ] **Step 3: Validar metadata em runtime local**

Run: `npm run dev:web`
Expected:
- `/curriculo-ats` title sem duplicação (`| EarlyCV` uma vez)
- `/palavras-chave-curriculo` title sem duplicação
- `/adaptar-curriculo-para-vaga` title sem duplicação
- canonical absoluto sem trailing slash extra nos 3
- `meta[name="keywords"]` presente nos 3 slugs alvo e não forçado para páginas sem `page.seo.keywords`
- `og:image` e `twitter:image` presentes e absolutos nos 3
- script FAQ JSON-LD presente apenas quando `page.faq` existe

- [ ] **Step 4: Validar links internos e anchors exatos**

Checklist manual:
- `/curriculo-ats` contém `/palavras-chave-curriculo` com anchor `palavras-chave para currículo`
- `/curriculo-ats` contém `/adaptar-curriculo-para-vaga` com anchor `adaptar currículo para cada vaga`
- `/palavras-chave-curriculo` contém `/curriculo-ats` com anchor `currículo compatível com ATS`
- `/palavras-chave-curriculo` contém `/adaptar-curriculo-para-vaga` com anchor `adaptar o currículo para a vaga`
- `/adaptar-curriculo-para-vaga` contém `/curriculo-ats` com anchor `currículo ATS`
- `/adaptar-curriculo-para-vaga` contém `/palavras-chave-curriculo` com anchor `palavras-chave certas`

- [ ] **Step 5: Commit final de verificação/documentação (se necessário)**

```bash
git add -A
git commit -m "test(seo): validate metadata schema and internal linking for target pages"
```

## Spec Coverage Self-Check

- Title duplicado: coberto em Task 2 (`sanitizeSeoTitle`).
- Meta descriptions: coberto nas Tasks 3, 4, 5.
- FAQ schema JSON-LD: coberto via `page.faq` + render condicional em Task 2 e dados oficiais nas Tasks 3-5.
- Linkagem interna exata: coberto nas Tasks 3-5 e validado em Task 6.
- Heading/keyword nos primeiros 100 chars: coberto nas Tasks 3-5.
- Meta-keywords específicas: coberto em Tasks 3-5 + envio condicional em Task 2.
- OG image: coberto em Task 2 com URL absoluta.
- Canonical sem trailing slash extra: preservado e validado em Task 6.
- Non-goal de não alterar keywords fora dos 3 slugs: coberto pela regra condicional em Task 2.
