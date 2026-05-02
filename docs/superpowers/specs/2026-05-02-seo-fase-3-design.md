# SEO Fase 3 - Hub utilitario de palavras-chave

## Objetivo

Adicionar a rota publica `/palavras-chave-curriculo` como hub utilitario indexavel, distinto do artigo `/blog/palavras-chave-curriculo`.

- Artigo do blog: ensina como usar palavras-chave.
- Hub utilitario: organiza listas por area/cargo/senioridade e converte para `/adaptar`.

## Arquitetura

- Reusar `apps/web/src/lib/seo-pages` (sem sistema paralelo).
- Evoluir `SeoPageDefinition` com:
  - `pageType: "transactional" | "hub" | "profession"`
  - `keywordGroups?`
  - `alertMessage?`
- Criar `apps/web/src/lib/seo-pages/pages/palavras-chave-curriculo.ts`.
- Agregar em `apps/web/src/lib/seo-pages/pages.ts`.
- Manter rota dinamica controlada em `apps/web/src/app/(seo)/[slug]/page.tsx`.

## Regras quantitativas minimas

- Cada area deve ter pelo menos 2 cargos.
- Cada cargo deve ter pelo menos 8 palavras-chave.
- Cada palavra-chave deve ter:
  - `term`
  - `whereToUse`
  - `whenItMakesSense`

## Escopo funcional

- Nova rota: `/palavras-chave-curriculo`.
- Hero + alerta educativo + secoes introdutorias.
- Blocos por area e cargo com keywords em layout responsivo.
- CTA em hero, meio e fim para `/adaptar`.
- FAQ final.
- Links internos para paginas SEO e blog.

## Fora de escopo

- Busca/filtro.
- Scroll tracking complexo.
- Ferramenta interativa.
- Paginas por profissao.

## SEO tecnico

- Metadata, canonical, OG/Twitter, robots.
- JSON-LD: `WebPage`, `BreadcrumbList`, `FAQPage` condicional.
- Sitemap inclui `/palavras-chave-curriculo`.

## Tracking

- Reusar `seo_page_viewed` e `seo_page_cta_clicked`.
- Para essa pagina: `page_type: "hub"`.

## Criterios de aceite

- Rota abre e estrutura por area/cargo/keyword esta completa.
- Regras quantitativas atendidas.
- CTA hero/meio/fim funcionando para `/adaptar`.
- FAQ presente.
- SEO tecnico e sitemap corretos.
- Tracking com `page_type: "hub"`.
- Links internos atualizados.
- Footer com link discreto.
- `check`, `test`, `build` em `@earlycv/web` passam.
