# SEO Fase 2 - Paginas transacionais indexaveis

## Objetivo

Implementar uma base reutilizavel para paginas SEO transacionais fora de `/blog`, com foco em captacao de intencao comercial/informacional e direcionamento para o fluxo de analise gratuita (`/adaptar`), preservando regras de produto e sem impactar fluxos core (pagamento, dashboard, admin e adaptacao).

Rotas publicas desta fase:

- `/curriculo-ats`
- `/adaptar-curriculo-para-vaga`
- `/curriculo-gupy`
- `/modelo-curriculo-ats`

## Escopo e restricoes

### Inclui

- Estrutura de dados tipada para paginas SEO transacionais.
- Rota dinamica controlada por registry em `app/(seo)/[slug]/page.tsx` com URL publica raiz.
- Metadata, canonical, OG/Twitter e robots index/follow por pagina.
- JSON-LD `WebPage` e `BreadcrumbList` para todas; `FAQPage` quando houver FAQ.
- Sitemap com as 4 rotas.
- Tracking especifico de funil SEO (`seo_page_viewed`, `seo_page_cta_clicked`).
- CTA padrao para `/adaptar`.
- Links internos entre paginas SEO e blog.
- Ajuste discreto de footer com links estrategicos.
- Testes focados e robustos.

### Nao inclui

- CMS.
- Paginas por profissao.
- Hub massivo de palavras-chave.
- Ferramenta extratora de keywords.
- Alteracoes de pagamento, dashboard ou fluxo principal de produto.

## Arquitetura

### 1) Registry separado do blog

Diretorio: `apps/web/src/lib/seo-pages/`

- `types.ts`: tipos e contratos.
- `tracking.ts`: emissores de eventos SEO.
- `pages.ts`: indice central agregado das paginas.
- `pages/` com um arquivo por pagina, para evitar arquivo-monstro:
  - `pages/curriculo-ats.ts`
  - `pages/adaptar-curriculo-para-vaga.ts`
  - `pages/curriculo-gupy.ts`
  - `pages/modelo-curriculo-ats.ts`

Blog permanece isolado em `apps/web/src/lib/blog` e `apps/web/src/app/blog/**`.

### 2) Tipagem e invariantes

`SeoPageSlug` (union literal inicial):

- `"curriculo-ats"`
- `"adaptar-curriculo-para-vaga"`
- `"curriculo-gupy"`
- `"modelo-curriculo-ats"`

`SeoPageDefinition` (campos principais):

- `slug`, `path`, `published`, `updatedAt`, `category`
- `seo`: `title`, `description`
- `hero`: `title`, `description`
- `sections`: blocos de conteudo
- `faq?`: perguntas e respostas
- `relatedLinks`
- `cta`

Helpers:

- `getAllSeoPages()`
- `getPublishedSeoPages()`
- `getSeoPageBySlug(slug)`
- `isSeoPageSlug(value)`
- `getSeoSitemapEntries()`

Invariantes:

- `path` sempre igual a `/${slug}`.
- `slug` unico.
- Apenas paginas `published: true` entram em sitemap e static params.

### 3) Roteamento dinamico seguro

Arquivo: `apps/web/src/app/(seo)/[slug]/page.tsx`

Regras obrigatorias:

1. Aceita exclusivamente slugs cadastrados no registry.
2. Slug fora do registry retorna `notFound()`.
3. `generateStaticParams` gera somente slugs `published: true`.
4. `generateMetadata` consome somente dados do registry.
5. Nao existe pagina generica aberta para qualquer slug.

Compatibilidade com rotas existentes:

- O segmento `(seo)` nao aparece na URL publica.
- O matcher dinamico nao deve sequestrar rotas existentes como `/blog`, `/adaptar`, `/dashboard`, `/admin`, `/pagamento`.
- Para isso, a protecao sera dupla:
  - lookup estrito no registry;
  - `notFound()` para qualquer slug nao registrado.

## Componentizacao

Diretorio: `apps/web/src/components/seo-pages/`

- `seo-page-layout.tsx`
- `seo-hero.tsx`
- `seo-section.tsx`
- `seo-analysis-cta.tsx`
- `seo-internal-links.tsx`
- `seo-view-trackers.tsx` (tracker client leve)

Observacoes:

- Reaproveitar padroes visuais atuais (monocromatico claro-escuro) e classes/utilitarios existentes.
- Reaproveitar ideias do `BlogAnalysisCta` sem acoplamento ao dominio blog.

## Conteudo por pagina

As quatro paginas seguirao exatamente os blocos obrigatorios aprovados:

- `/curriculo-ats`
- `/adaptar-curriculo-para-vaga`
- `/curriculo-gupy` (com linguagem segura sobre plataformas como Gupy)
- `/modelo-curriculo-ats`

Links internos obrigatorios por pagina serao definidos no registry para manter fonte unica.

## CTA padrao

- Titulo: `Descubra se seu curriculo combina com a vaga`
- Texto: `Cole a descricao da vaga, envie seu curriculo e receba uma analise gratuita de compatibilidade em poucos minutos.`
- Botao: `Analisar meu curriculo gratis`
- Destino: `/adaptar`

Posicoes de render:

- Hero
- Meio da pagina
- Rodape da pagina

## SEO tecnico

Por pagina:

- `title`
- `description`
- `alternates.canonical`
- `openGraph`
- `twitter`
- `robots: { index: true, follow: true }`

Structured data:

- Sempre: `WebPage`, `BreadcrumbList`
- Condicional: `FAQPage` somente quando `faq` existir e tiver itens

Sitemap:

- `app/sitemap.ts` passa a consumir `getSeoSitemapEntries()` e incluir as 4 rotas.

Robots:

- Confirmar que nao bloqueia essas rotas publicas.

## Tracking

Eventos de funil SEO:

1. `seo_page_viewed`
   - `slug`
   - `path`
   - `page_type: "transactional_seo"`
   - `source: "seo_page"`

2. `seo_page_cta_clicked`
   - `slug`
   - `path`
   - `location: "hero" | "middle" | "bottom"`
   - `target: "/adaptar"`
   - `source: "seo_page"`

Implementacao:

- `src/lib/seo-pages/tracking.ts` com wrappers de `emitBusinessFunnelEvent`.
- Tracker client leve em `seo-view-trackers.tsx`.
- Sem duplicar `page_view` global.

## Menu/footer

Se houver footer institucional na home, adicionar discretamente:

- Blog
- Curriculo ATS
- Adaptar curriculo para vaga

Sem redesign de header.

## Testes

Cobertura minima:

- Registry:
  - slugs unicos
  - `path` coerente com `slug`
  - published/active coerente
- Rota:
  - slugs validos renderizam
  - slug invalido cai em `notFound` (via helper/guard testavel)
- Sitemap:
  - inclui as 4 rotas SEO
- Tracking:
  - payload de `seo_page_viewed`
  - payload de `seo_page_cta_clicked`
- Structured data:
  - `FAQPage` apenas quando houver FAQ
- CTA:
  - aponta para `/adaptar`

Sem testes frageis baseados em blocos longos de texto.

## Riscos e mitigacoes

1. **Conflito com rotas existentes por causa de `[slug]` na raiz**
   - Mitigacao: lookup estrito no registry + `notFound()` para qualquer slug fora da lista.
   - Verificacao: smoke em rotas existentes (`/blog`, `/adaptar`, `/dashboard`, `/admin`, `/pagamento`).

2. **Registry crescer rapido e perder legibilidade**
   - Mitigacao: conteudo por arquivo em `pages/` + indice central `pages.ts`.

3. **Acoplamento indevido com blog**
   - Mitigacao: dominio separado em `lib/seo-pages` e `components/seo-pages`.

## Plano incremental de execucao

1. Criar `lib/seo-pages` (types, paginas, tracking e helpers).
2. Criar componentes `components/seo-pages`.
3. Implementar `app/(seo)/[slug]/page.tsx` com metadata + JSON-LD + trackers.
4. Integrar sitemap.
5. Ajuste discreto no footer.
6. Adicionar testes focados.
7. Rodar `check`, `test` e `build` do `@earlycv/web`.

## Criterios de aceite

- As 4 rotas publicas carregam corretamente.
- Slug nao cadastrado retorna 404.
- Metadata/canonical/OG/Twitter/robots corretos.
- JSON-LD `WebPage` e `BreadcrumbList` em todas.
- JSON-LD `FAQPage` apenas quando aplicavel.
- Sitemap inclui as 4 rotas.
- Tracking SEO especifico funcionando.
- Sem alteracoes em pagamento/dashboard/fluxos core.
- `npm run check --workspace @earlycv/web` passa.
- `npm run test --workspace @earlycv/web` passa.
- `npm run build --workspace @earlycv/web` passa.
