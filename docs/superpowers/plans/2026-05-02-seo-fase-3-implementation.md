# SEO Fase 3 - Hub de Palavras-chave Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar `/palavras-chave-curriculo` como hub utilitario indexavel, com listas por area/cargo e conversao para `/adaptar`.

**Architecture:** Evoluir o registry de `seo-pages` com `pageType` e `keywordGroups`, adicionar pagina hub dedicada e render condicional no mesmo `[slug]` controlado. Sem busca/filtro nesta fase.

**Tech Stack:** Next.js App Router, TypeScript, Tailwind, Metadata API, Node test runner.

---

### Task 1: Evoluir tipos e registry
- [ ] Atualizar `types.ts` com `pageType` e estruturas de `keywordGroups`.
- [ ] Criar `pages/palavras-chave-curriculo.ts` com 11 areas, 2 cargos por area, 8 keywords por cargo.
- [ ] Agregar no `pages.ts`.

### Task 2: Render do hub
- [ ] Criar componente `seo-keyword-hub.tsx` responsivo.
- [ ] Atualizar `app/(seo)/[slug]/page.tsx` para branch `hub` e alerta educativo.
- [ ] Preservar fallback `notFound` para slugs nao registrados.

### Task 3: Tracking e links
- [ ] Ajustar tracking SEO para `page_type` dinamico por `pageType`.
- [ ] Atualizar links internos das paginas fase 2 para o hub.
- [ ] Inserir link do hub no footer da home.

### Task 4: SEO e sitemap
- [ ] Confirmar metadata/JSON-LD/Breadcrumb/FAQ no hub.
- [ ] Validar inclusao em sitemap.

### Task 5: Testes e verificacao
- [ ] Atualizar specs do registry/sitemap para novo slug.
- [ ] Adicionar spec da regra quantitativa do hub.
- [ ] Rodar `npm run check --workspace @earlycv/web`.
- [ ] Rodar `npm run test --workspace @earlycv/web`.
- [ ] Rodar `npm run build --workspace @earlycv/web`.
