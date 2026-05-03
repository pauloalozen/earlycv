# Unificacao de header privado em dashboard/compras/adaptar

## Objetivo

Padronizar o header das rotas privadas `/dashboard`, `/compras` e `/adaptar` usando o mesmo comportamento visual e funcional do `/dashboard`.

## Contexto atual

- `/dashboard` ja usa `AppHeader` com `availableCredits`, exibindo bloco de creditos no menu.
- `/compras` usa `AppHeader`, mas sem `availableCredits`.
- `/adaptar` (client route) usa `AppHeader`, mas sem `availableCredits`.
- Rotas publicas indexaveis usam `PublicNavBar` e nao entram no escopo.

## Decisao de design

Aplicar ajuste pontual por rota (sem refactor amplo e sem novo header global):

1. Manter `AppHeader` como fonte unica do padrao privado.
2. Em `/compras`, buscar plano do usuario e calcular `availableCredits` com a mesma regra de exibicao do `/dashboard` (`"—"`, `"∞"` ou numero).
3. Em `/adaptar`, estender o retorno de `getAuthStatus()` para incluir creditos exibiveis no menu e repassar para `AppHeader` apos carregar auth.
4. Preservar protecao/autenticacao existente das tres rotas.

## Arquitetura e arquivos afetados

- `apps/web/src/app/compras/page.tsx`
  - incluir leitura de plano (`getMyPlan`) com fallback seguro em falha.
  - passar `availableCredits` para `AppHeader`.
- `apps/web/src/lib/session-actions.ts`
  - ampliar contrato de `getAuthStatus()` para retornar creditos disponiveis para UI do header privado.
- `apps/web/src/app/adaptar/page.tsx`
  - consumir novo campo de `getAuthStatus()`.
  - passar `availableCredits` para `AppHeader`.

## Invariantes e restricoes

- Nao alterar `PublicNavBar`.
- Nao alterar `/`, `/blog`, `/blog/[slug]` e demais rotas publicas/SEO.
- Nao alterar metadata, canonical, robots, structured data ou configuracoes de cache/SSR publico.
- Nao criar `UnifiedHeader` global.
- Nao reestruturar grupos de rotas do App Router.

## Comportamento esperado

- As tres rotas privadas continuam com o mesmo componente `AppHeader`.
- `/compras` e `/adaptar` passam a exibir no dropdown o mesmo bloco de creditos visto em `/dashboard`.
- Em falha de leitura de plano, o header nao quebra e usa estado neutro (`"—"`) quando apropriado.

## Testes e verificacao

- Validacao manual:
  - abrir `/dashboard`, `/compras` e `/adaptar` logado e comparar header.
  - confirmar que `/`, `/blog` e `/blog/[slug]` seguem com header publico atual.
  - confirmar ausencia de mudancas em SEO/cache de rotas publicas.
- Validacao automatizada:
  - `npm run check`
  - `npm run build`

## Criterios de aceite

- `/dashboard`, `/compras` e `/adaptar` exibem o mesmo padrao de header privado.
- Comportamento do header em `/compras` e `/adaptar` fica consistente com `/dashboard`, incluindo creditos.
- Nenhuma rota publica/SEO foi alterada.
- `npm run check` passa.
- `npm run build` passa.
