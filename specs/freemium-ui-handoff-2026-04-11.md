# Freemium UI Handoff — 2026-04-11

## Escopo concluido nesta rodada

- Remocao de rotas antigas pedidas: `/adaptar/[id]/checkout`, `/adaptar/[id]/resultado`, `/ui`.
- Saneamento de lint/a11y/format para estabilizar `npm run check` no monorepo.
- Padrao global de transicao entre rotas no web app com spinner e reveal suave.
- Regra de produto aplicada: sem spinner na landing (`/`).
- Correcao de glitches de transicao e carregamento em `/adaptar/resultado`.
- Microcopy adicionado na landing abaixo do CTA com setas em icone:
  - `Envie seu CV -> Cole a vaga -> Veja o que ajustar` (renderizado com icones, nao texto literal).
- Correcao da caixa de upload em `/adaptar` para nao mudar de altura ao selecionar arquivo.

## Decisoes de UX implementadas

- Landing sem spinner de transicao.
- Transicoes internas com reset explicito para fase `loading` por troca de pathname.
- Em `prefers-reduced-motion`, transicoes minimizadas/desativadas.
- Spinner local de `/adaptar/resultado` centralizado em viewport quando `data` ainda nao existe.
- Caixa de upload com altura estavel e nome de arquivo truncado para evitar reflow.

## Arquivos principais alterados

- `apps/web/src/app/template.tsx`
- `apps/web/src/app/globals.css`
- `apps/web/src/app/adaptar/template.tsx`
- `apps/web/src/app/adaptar/page.tsx`
- `apps/web/src/app/adaptar/resultado/page.tsx`
- `apps/web/src/app/page.tsx`
- `apps/web/src/app/meus-cvs/page.tsx`
- `apps/web/src/lib/route-transition-template.spec.ts`
- `apps/web/src/lib/loading-centering.spec.ts`
- `apps/web/src/lib/adaptar-upload-box-stability.spec.ts`
- `apps/web/src/lib/deprecated-routes.spec.ts`

## Validacao

- `npm run check` passando.
- `npm run test` passando.
- Specs locais de regressao para transicao/centralizacao/upload passando.

## Proximos passos sugeridos

1. Revisao visual rapida no fluxo `/adaptar -> /adaptar/resultado` em desktop e mobile.
2. Se houver novo glitch de transicao, preferir ajustar `template.tsx` (camada global) antes de adicionar loader local novo.
3. Manter novos loaders com altura/posicionamento fixos para evitar reflow visivel.
