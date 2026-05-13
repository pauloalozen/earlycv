# SEO Technical Optimization Design for 3 App Router Content Pages

## Scope

Apply technical SEO updates to exactly these public pages rendered from the SEO page registry:

- `/curriculo-ats`
- `/palavras-chave-curriculo`
- `/adaptar-curriculo-para-vaga`

Constraints:

- Do not rewrite core article body content in this pass.
- Allowed content-level edits: `hero.title`, `hero.description`, selected `sections[].heading` (H2), FAQ entries, and internal link labels/targets.
- Preserve current canonical URL format (absolute URL, no trailing slash).

## Current Architecture Context

- Route renderer and metadata composition live in `apps/web/src/app/(seo)/[slug]/page.tsx`.
- Per-page content and SEO data live in `apps/web/src/lib/seo-pages/pages/*.ts`.
- Global title template is `%s | EarlyCV` in `apps/web/src/lib/site.ts`.
- Existing page-level titles already include `| EarlyCV`, which can cause `| EarlyCV | EarlyCV` in output.

## Goals and Acceptance Criteria

### 1) Title duplication fix

Goal: remove duplicated brand suffix.

Acceptance criteria:

- Browser title must end as `| EarlyCV` exactly once on all 3 pages.
- No page should render `| EarlyCV | EarlyCV`.

Implementation rule:

- Normalize page title in metadata generation by stripping trailing `| EarlyCV` from page-provided title before applying layout template.

### 2) Page-specific meta keywords

Goal: replace generic site keywords with intent-specific terms for each page.

Acceptance criteria:

- `keywords` field in metadata output for each page matches the provided list exactly (including accents/variants).

### 3) Clickable meta descriptions (<= 155 chars)

Goal: increase CTR with direct benefit-first copy.

Acceptance criteria:

- Each page description equals the user-provided text.
- Character count is validated to stay at or below 155.

### 4) Heading/keyword alignment

Goal: align heading semantics with primary query intent.

Acceptance criteria per page:

- H1 includes principal keyword exactly once.
- Principal keyword appears within first 100 characters of body intro (hero description).
- At least one H2 includes principal keyword or acceptable variation.

### 5) Internal linking triangle

Goal: strengthen topical authority and crawl paths between target pages.

Acceptance criteria:

- Each page contains links to the other two pages with exact requested anchor texts.
- Link targets use the specified paths.

### 6) FAQ JSON-LD

Goal: add structured FAQ eligibility and semantic coverage.

Acceptance criteria:

- Each page emits `FAQPage` JSON-LD with exactly the 3 provided Q/A items.
- Script tag is rendered as `<script type="application/ld+json">`.
- FAQ visible block remains consistent with FAQ data source.

### 7) OG image guarantee

Goal: improve social preview consistency.

Acceptance criteria:

- All 3 pages output `openGraph.images` and `twitter.images`.
- Same static image can be reused for now.

### 8) Canonical validation

Goal: avoid canonical drift vs Search Console URLs.

Acceptance criteria:

- Canonical equals absolute URL for each exact path with no trailing slash.
- No extra slash appended.

## Proposed Approach (Recommended)

Use a centralized metadata guardrail in route-level `generateMetadata` plus page-specific data in registry files.

Why this approach:

- Fixes duplicate title at a single choke point.
- Keeps page intent data (keywords, FAQ, copy) close to content source.
- Reduces future regression risk when new SEO pages are added.

## Design Details

### A. Metadata generator updates (`apps/web/src/app/(seo)/[slug]/page.tsx`)

1. Introduce title sanitizer:

- Input: `page.seo.title`
- Behavior: remove trailing brand suffix pattern (`| EarlyCV`) if present; trim whitespace.
- Output assigned to `metadata.title` so root layout template appends one brand suffix only.

2. Add `keywords` pass-through:

- Read from page definition as `string[]` (`page.seo.keywords`).
- Set in returned `Metadata` object directly as array (Next accepts `string | string[]`).
- If `page.seo.keywords` is undefined, do not include `keywords` in returned metadata.

3. Guarantee OG/Twitter images:

- Build a single absolute URL in all cases:
  - `page.seo.ogImage` -> `getAbsoluteUrl(page.seo.ogImage)`
  - fallback -> `siteConfig.ogImage` (must already be absolute)
- Set in both `openGraph.images` and `twitter.images`.

4. Canonical remains unchanged:

- Continue using `getAbsoluteUrl(page.path)`.

### B. Type model updates (`apps/web/src/lib/seo-pages/types.ts`)

Extend SEO page definition to support structured metadata fields needed by this task:

- `seo.keywords?: string[]`
- Optional `seo.ogImage?: string` (for future per-page customization)
- `faq?: Array<{ question: string; answer: string }>`

Backwards compatibility:

- Existing pages without explicit `ogImage` continue using fallback.
- Existing pages without explicit `keywords` keep current behavior (no metadata override injected by this route-level change).
- Both FAQ JSON-LD script and visible FAQ block are rendered only when `page.faq` exists.

### C. Per-page data updates

Files:

- `apps/web/src/lib/seo-pages/pages/curriculo-ats.ts`
- `apps/web/src/lib/seo-pages/pages/palavras-chave-curriculo.ts`
- `apps/web/src/lib/seo-pages/pages/adaptar-curriculo-para-vaga.ts`

For each file:

1. Replace `seo.description` with provided CTR copy.
2. Add page-specific keywords list as `string[]` (not comma-separated string).
3. Replace FAQ entries with provided Q/A triples.
4. Adjust `hero.title` (H1) to include exact primary keyword once.
5. Adjust `hero.description` to include primary keyword within first 100 chars.
6. Ensure at least one section heading (H2) repeats primary keyword/valid variation.
7. Update `relatedLinks` to include the two required internal links with exact anchor text.

## Exact Data to Apply

### `/curriculo-ats`

- Keywords (`string[]`):
  - `currículo ats`
  - `curriculo ats`
  - `criar currículo ats`
  - `curriculo ats modelo`
  - `currículo compatível com ats`
  - `ats currículo`
- Description:
  - `Saiba como criar um currículo compatível com ATS: estrutura, formatação e palavras-chave certas. Adapte o seu CV com IA no EarlyCV.`
- Required anchors:
  - `/palavras-chave-curriculo` with `palavras-chave para currículo`
  - `/adaptar-curriculo-para-vaga` with `adaptar currículo para cada vaga`
- FAQ (`faq: Array<{ question: string; answer: string }>`):
  - `question`: `O que é um currículo ATS?`
    - `answer`: `Um currículo ATS é um documento formatado para ser lido corretamente por sistemas automáticos de triagem (Applicant Tracking System), usados por empresas para filtrar candidatos antes da análise humana.`
  - `question`: `Como saber se meu currículo é compatível com ATS?`
    - `answer`: `Você pode usar o EarlyCV para comparar seu currículo com a descrição da vaga e identificar os termos ausentes que o ATS está procurando.`
  - `question`: `Quais erros de formatação reprovam um currículo no ATS?`
    - `answer`: `Tabelas, colunas múltiplas, cabeçalhos e rodapés com informações críticas, fontes não-padrão e arquivos em formatos não suportados são os erros mais comuns.`

### `/palavras-chave-curriculo`

- Keywords (`string[]`):
  - `palavras chave para curriculo`
  - `palavras chaves para curriculo`
  - `palavras-chave currículo ats`
  - `palavras chave currículo`
  - `termos para currículo`
- Description:
  - `Veja quais palavras-chave usar no currículo por área e cargo. Compare seu CV com a vaga e gere uma versão alinhada gratuitamente.`
- Required anchors:
  - `/curriculo-ats` with `currículo compatível com ATS`
  - `/adaptar-curriculo-para-vaga` with `adaptar o currículo para a vaga`
- FAQ (`faq: Array<{ question: string; answer: string }>`):
  - `question`: `Quais palavras-chave colocar no currículo?`
    - `answer`: `As melhores palavras-chave vêm da própria descrição da vaga. Termos de hard skills, cargos mencionados e ferramentas específicas têm maior peso nos filtros ATS.`
  - `question`: `Posso colocar muitas palavras-chave no currículo?`
    - `answer`: `Não. Keyword stuffing é detectado tanto por ATS modernos quanto por recrutadores. Use os termos de forma natural dentro de frases que descrevem suas experiências reais.`
  - `question`: `Como o EarlyCV ajuda com palavras-chave?`
    - `answer`: `O EarlyCV analisa a descrição da vaga e identifica os termos mais relevantes que estão faltando no seu currículo, sugerindo onde e como incluí-los.`

### `/adaptar-curriculo-para-vaga`

- Keywords (`string[]`):
  - `adaptar currículo para vaga`
  - `adaptar curriculo`
  - `como adaptar currículo`
  - `currículo por vaga`
  - `personalizar currículo`
- Description:
  - `Adapte seu currículo para cada vaga em minutos: compare, encontre lacunas e gere uma versão personalizada com IA. Grátis para testar.`
- Required anchors:
  - `/curriculo-ats` with `currículo ATS`
  - `/palavras-chave-curriculo` with `palavras-chave certas`
- FAQ (`faq: Array<{ question: string; answer: string }>`):
  - `question`: `Por que devo adaptar o currículo para cada vaga?`
    - `answer`: `Cada vaga tem requisitos específicos. Um currículo genérico raramente passa pelos filtros ATS e raramente chama atenção de recrutadores que recebem centenas de candidaturas.`
  - `question`: `Adaptar o currículo significa inventar experiências?`
    - `answer`: `Não. Adaptar significa reorganizar, destacar e reformular as experiências que você já tem de forma mais alinhada ao que a vaga exige. O EarlyCV nunca inventa informações.`
  - `question`: `Quanto tempo leva para adaptar um currículo?`
    - `answer`: `Com o EarlyCV, menos de 2 minutos: você cola a vaga, faz upload do CV e recebe a versão adaptada pronta para envio.`

## Error Handling and Edge Cases

- If title lacks suffix, sanitizer is a no-op.
- If title has repeated suffixes, sanitizer removes all trailing duplicates before template application.
- Se `page.seo.keywords` for undefined, o campo `keywords` não é incluído no objeto `Metadata` retornado por `generateMetadata`. Qualquer fallback de keywords definido fora desse fluxo (ex: layout global) não é alterado por esta task.
- FAQ text is rendered via JSON stringify to avoid malformed script.

## Testing and Verification Plan

1. Type/lint safety:

- Run web type checks/lint for touched files.

2. Snapshot/manual metadata checks:

- Verify generated HTML metadata for each route includes:
  - single `| EarlyCV` in title
  - specific `meta[name="keywords"]`
  - target description
  - canonical exact URL
  - `og:image` and twitter image
  - FAQ JSON-LD present and valid JSON

3. Content checks:

- Confirm H1 includes required keyword once.
- Confirm keyword appears in first 100 chars of hero description.
- Confirm at least one H2 with keyword variation.
- Confirm required internal links and anchor text are present.
- Confirm `/curriculo-ats` links to `/palavras-chave-curriculo` with anchor `palavras-chave para currículo`.
- Confirm `/curriculo-ats` links to `/adaptar-curriculo-para-vaga` with anchor `adaptar currículo para cada vaga`.
- Confirm `/palavras-chave-curriculo` links to `/curriculo-ats` with anchor `currículo compatível com ATS`.
- Confirm `/palavras-chave-curriculo` links to `/adaptar-curriculo-para-vaga` with anchor `adaptar o currículo para a vaga`.
- Confirm `/adaptar-curriculo-para-vaga` links to `/curriculo-ats` with anchor `currículo ATS`.
- Confirm `/adaptar-curriculo-para-vaga` links to `/palavras-chave-curriculo` with anchor `palavras-chave certas`.

## Non-Goals

- No full rewrite of article body paragraphs.
- No visual redesign.
- No changes to unrelated routes or global SEO strategy.
- Nenhuma alteração ao campo `keywords` (ou fallback de keywords) de páginas fora dos 3 slugs alvo. A generalização do novo campo no type model não deve sobrescrever o comportamento existente de páginas que não definem `keywords` explicitamente.

## Rollback Plan

- Revert only touched SEO page definition files and `app/(seo)/[slug]/page.tsx` metadata logic.
- Keep type model additions if needed by other pages only when non-breaking.

## Risks and Mitigations

- Risk: title normalization accidentally strips intentional text.
  - Mitigation: remove only explicit trailing `| EarlyCV` pattern(s), preserve rest.
- Risk: keywords field shape mismatch with Next metadata expectations.
  - Mitigation: use string array directly; validate build/typecheck.
- Risk: mismatch between visible FAQ and JSON-LD FAQ.
  - Mitigation: keep both driven from same `page.faq` data source.
