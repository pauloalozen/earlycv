# UI Component Rules

Use estas regras ao criar ou evoluir componentes em `apps/web/src/components/ui`.

## Objetivo

- Criar componentes genericos, reutilizaveis e consistentes com as telas do Pencil.
- Priorizar componentes que possam ser usados em varias paginas antes de criar versoes especificas de uma tela.
- Manter uma linguagem visual inspirada em EarlyCV: superfícies claras, acento laranja quente, suporte a estados de sucesso em verde-agua, tipografia principal humanista e apoio mono para status e meta-informacao.

## Fonte visual

Antes de criar um novo componente, observe se ele repete padroes ja vistos em:

- landing page
- onboarding
- dashboard
- detalhe da vaga
- adaptacao de curriculo
- alertas
- planos

Se o padrao ja existir, extraia para um componente generico em vez de duplicar markup.

## Regras de implementacao

- Sempre usar named exports. Nunca usar `default export` em `apps/web/src/components/ui`.
- Sempre estender props nativas apropriadas do HTML com TypeScript.
- Para elementos interativos, usar `forwardRef` quando fizer sentido, como em `button`, `input` e futuros `textarea`, `select`, `dialog`.
- Usar Tailwind para composicao visual.
- Usar `tailwind-variants` quando houver variantes reais de aparencia, tamanho, densidade ou estado.
- Usar `tailwind-merge` via `cn()` para merge de `className` com overrides do consumidor.
- Evitar utilitarios inline repetidos em varias telas; quando repetirem, promover para componente ou variante.
- Nao adicionar logica de negocio nos componentes de UI.
- Nao acoplar componentes a dados de uma pagina especifica quando uma API por props resolver.

## Padrao de arquivos

- Um componente por arquivo, em kebab-case: `job-card.tsx`, `search-input.tsx`.
- Exportar tudo por `apps/web/src/components/ui/index.ts`.
- Helpers compartilhados de classe ou formatacao leve podem ir para `apps/web/src/lib`, como `apps/web/src/lib/cn.ts`.

## API dos componentes

- Preferir APIs pequenas e previsiveis.
- Preferir props semanticas, por exemplo `variant`, `size`, `tone`, `featured`.
- Quando houver composicao suficiente com `children`, preferir `children` a criar muitas props especiais.
- Quando o padrao for recorrente e estruturado, expor props nomeadas. Exemplo: `JobCard` com `company`, `title`, `meta`, `fitLabel`, `signal`.
- Manter nomes coerentes com a biblioteca existente.

## Estilo visual

- Border radius principal: arredondado generoso, normalmente `rounded-[20px]`, `rounded-2xl` ou `rounded-full` para CTA.
- Superficie default: branca com borda `stone-200`.
- Superficie muted: `stone-100` ou equivalente para campos e estados vazios leves.
- Superficie accent: gradiente laranja para destaques estrategicos.
- Texto principal: `stone-900`.
- Texto secundario: `stone-500`.
- Meta/status: `font-mono`, caixa alta opcional, tracking mais aberto.
- Estados de sucesso: tons de `emerald/teal` usados com moderacao.

## Variantes

Crie variantes apenas quando houver um padrao real observado em mais de um contexto.

Use em geral:

- `variant` para aparencia
- `size` para escala
- `tone` para intensidade/semantica
- booleanos como `featured`, `block`, `loading` quando o comportamento for claro

Evite variantes demais no primeiro momento. Comece enxuto e expanda com necessidade real.

## Acessibilidade

- Preservar foco visivel.
- Nao remover semantica nativa de elementos HTML.
- Respeitar `disabled`, `type`, `aria-label` e props nativas equivalentes.
- Se um componente visual nao for semanticamente interativo, nao renderize `button` ou `a` sem necessidade.

## Showcase e validacao

- Todo componente novo relevante deve aparecer na rota `apps/web/src/app/ui/page.tsx` para validacao visual.
- Sempre que criar ou alterar componentes, validar pelo menos com:
  - `npm run check`
  - `npm run build`

## Quando criar componente novo

Crie um novo componente quando pelo menos um destes casos acontecer:

- o mesmo bloco aparece em duas ou mais telas
- existe uma estrutura reutilizavel com a mesma hierarquia visual
- ha necessidade de variantes previsiveis para um mesmo elemento base

Se for uma composicao muito especifica de uma tela, mantenha fora de `ui` ate surgir repeticao real.

## Checklist rapido

- o componente e generico?
- usa named export?
- estende props nativas corretas?
- usa `tailwind-variants` apenas se houver variantes reais?
- suporta `className` com `cn()`?
- segue a paleta e tipografia da biblioteca?
- foi exportado em `apps/web/src/components/ui/index.ts`?
- foi adicionado ao showcase em `apps/web/src/app/ui/page.tsx`?
- passou em `npm run check` e `npm run build`?
