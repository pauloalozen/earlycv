# SEO Fase 2 - Paginas transacionais indexaveis Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar 4 paginas SEO transacionais em URL raiz com rota dinamica controlada por registry, metadata/JSON-LD completos, tracking dedicado e sitemap atualizado.

**Architecture:** As paginas serao definidas em registry tipado separado do blog (`src/lib/seo-pages`), com conteudo por arquivo e indice central. A renderizacao sera por `app/(seo)/[slug]/page.tsx` com lookup estrito, `notFound()` para slugs invalidos e `generateStaticParams` baseado apenas em paginas publicadas. Componentes dedicados em `components/seo-pages` garantem layout consistente e reutilizacao.

**Tech Stack:** Next.js App Router, TypeScript, Metadata API, JSON-LD via script, Vitest/Node test runner, Tailwind/CSS utilitarios existentes.

---

### Task 1: Definir dominio de dados das SEO pages

**Files:**
- Create: `apps/web/src/lib/seo-pages/types.ts`
- Create: `apps/web/src/lib/seo-pages/pages/curriculo-ats.ts`
- Create: `apps/web/src/lib/seo-pages/pages/adaptar-curriculo-para-vaga.ts`
- Create: `apps/web/src/lib/seo-pages/pages/curriculo-gupy.ts`
- Create: `apps/web/src/lib/seo-pages/pages/modelo-curriculo-ats.ts`
- Create: `apps/web/src/lib/seo-pages/pages.ts`

- [ ] Step 1: Criar tipos (`SeoPageSlug`, `SeoPageDefinition`, blocos de secao/faq/links/cta).
- [ ] Step 2: Criar conteudo das 4 paginas em arquivos separados com `published: true`.
- [ ] Step 3: Criar agregador central com helpers: `getAllSeoPages`, `getPublishedSeoPages`, `getSeoPageBySlug`, `isSeoPageSlug`, `getSeoSitemapEntries`.
- [ ] Step 4: Verificar invariante `path === /${slug}` no agregador.

### Task 2: Tracking SEO dedicado

**Files:**
- Create: `apps/web/src/lib/seo-pages/tracking.ts`
- Create: `apps/web/src/components/seo-pages/seo-view-trackers.tsx`
- Test: `apps/web/src/lib/seo-pages/tracking.spec.ts`

- [ ] Step 1: Implementar `trackSeoPageViewed` com `seo_page_viewed`.
- [ ] Step 2: Implementar `trackSeoPageCtaClicked` com `seo_page_cta_clicked`.
- [ ] Step 3: Criar tracker client leve `SeoPageViewTracker`.
- [ ] Step 4: Cobrir payload esperado no spec.

### Task 3: Componentes reutilizaveis de pagina SEO

**Files:**
- Create: `apps/web/src/components/seo-pages/seo-page-layout.tsx`
- Create: `apps/web/src/components/seo-pages/seo-hero.tsx`
- Create: `apps/web/src/components/seo-pages/seo-section.tsx`
- Create: `apps/web/src/components/seo-pages/seo-analysis-cta.tsx`
- Create: `apps/web/src/components/seo-pages/seo-internal-links.tsx`

- [ ] Step 1: Implementar layout base com estetica atual e area para scripts JSON-LD.
- [ ] Step 2: Implementar hero padrao.
- [ ] Step 3: Implementar secao generica com paragrafos/bullets/exemplo.
- [ ] Step 4: Implementar CTA padrao para `/adaptar` com tracking de `location`.
- [ ] Step 5: Implementar bloco de links internos.

### Task 4: Rota dinamica controlada na raiz

**Files:**
- Create: `apps/web/src/app/(seo)/[slug]/page.tsx`

- [ ] Step 1: Implementar `generateStaticParams` consumindo apenas paginas `published`.
- [ ] Step 2: Implementar `generateMetadata` via registry (title/description/canonical/OG/Twitter/robots).
- [ ] Step 3: Implementar render com lookup estrito e `notFound()` para slug nao registrado.
- [ ] Step 4: Incluir JSON-LD `WebPage` + `BreadcrumbList`; `FAQPage` condicional.
- [ ] Step 5: Incluir trackers e CTAs (hero/middle/bottom) + links internos.

### Task 5: Sitemap e navegacao discreta

**Files:**
- Modify: `apps/web/src/app/sitemap.ts`
- Modify: `apps/web/src/app/page.tsx`
- Test: `apps/web/src/app/sitemap.blog.spec.ts` (ou novo spec dedicado)

- [ ] Step 1: Adicionar entradas do registry SEO no sitemap.
- [ ] Step 2: Validar que robots continuam permitindo indexacao dessas rotas.
- [ ] Step 3: Inserir links discretos no footer da home: Blog, Curriculo ATS, Adaptar curriculo para vaga.
- [ ] Step 4: Atualizar teste de sitemap para cobrir 4 rotas SEO.

### Task 6: Testes focados da camada SEO

**Files:**
- Create: `apps/web/src/lib/seo-pages/pages.spec.ts`
- Create: `apps/web/src/app/(seo)/[slug]/page.spec.ts` (ou spec de helpers de render)

- [ ] Step 1: Testar integridade do registry (slug unico, path coerente, published).
- [ ] Step 2: Testar comportamento para slug invalido (caminho de `notFound`).
- [ ] Step 3: Testar presenca condicional de FAQ structured data.
- [ ] Step 4: Testar que CTA aponta para `/adaptar`.

### Task 7: Validacao final

**Files:**
- Verify only

- [ ] Step 1: Rodar `npm run check --workspace @earlycv/web`.
- [ ] Step 2: Rodar `npm run test --workspace @earlycv/web`.
- [ ] Step 3: Rodar `npm run build --workspace @earlycv/web`.
- [ ] Step 4: Verificar rotas manuais: `/curriculo-ats`, `/adaptar-curriculo-para-vaga`, `/curriculo-gupy`, `/modelo-curriculo-ats`, e slug invalido retornando 404.

## Plan review

- Cobertura do spec: inclui rota controlada, static params publicados, metadata registry-driven, JSON-LD, sitemap, tracking, CTA, links internos, footer discreto e testes.
- Sem placeholders pendentes: todas as tarefas tem caminhos concretos.
- Consistencia de tipos/nomes: `SeoPageSlug`, `SeoPageDefinition`, `trackSeoPageViewed`, `trackSeoPageCtaClicked`.
