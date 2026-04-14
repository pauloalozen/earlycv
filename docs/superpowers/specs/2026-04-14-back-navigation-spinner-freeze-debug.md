# Back Navigation Spinner Freeze (Planos) - Debug Spec

## Contexto

- Bug reportado em ambiente logado: ao abrir `/planos`, clicar em `Começar grátis` (vai para `/adaptar`) e voltar pelo botão do navegador, a rota `/planos` pode ficar travada no spinner de transição.
- Requisito de UX inegociável: manter o comportamento de **spinner bloqueando a tela até montagem** + **animação de entrada**.
- Soluções que removem spinner ou removem animação nao sao aceitas como resultado final.

## Reproducao validada pelo usuario

1. Usuario autenticado.
2. Abrir `/planos`.
3. Clicar no CTA `Começar grátis` (navega para `/adaptar`).
4. Usar `voltar` do navegador.
5. Resultado observado: tela pode permanecer travada no spinner (sem liberar o conteudo).

## Arquivos principais envolvidos

- `apps/web/src/app/template.tsx` (transicao global de rota)
- `apps/web/src/app/globals.css` (classes `route-transition-*`)
- `apps/web/src/components/page-shell.tsx` (gate local com spinner em algumas rotas)
- `apps/web/src/app/planos/page.tsx` (rota alvo)

## Hipotese base investigada

- Corrida entre eventos de navegacao do browser (`back/forward`, `pageshow`, `popstate`) e ciclo de fase da transicao (`loading -> revealing -> done`), possivelmente com restauracao de estado/cache em timing diferente do esperado no App Router.

## Tentativas realizadas (ordem cronologica) e resultado

### 1) Ajuste no `PageShell`

- Mudanca: substituir `setTimeout` por `requestAnimationFrame` + listener `pageshow` para liberar `ready`.
- Arquivo: `apps/web/src/components/page-shell.tsx`.
- Resultado: **nao resolveu** o travamento reportado no fluxo logado de `/planos`.

### 2) Remocao do `PageShell` de `/planos`

- Mudanca: remover wrapper `<PageShell>` de `apps/web/src/app/planos/page.tsx`.
- Resultado: reduziu complexidade de gate duplo, mas **nao resolveu** sozinho.

### 3) `pageshow` global sempre forcando `done`

- Mudanca em `apps/web/src/app/template.tsx`: no evento `pageshow`, chamar `setPhase("done")` sem condicional de `persisted`.
- Resultado: **nao resolveu** de forma confiavel no fluxo reportado.

### 4) Bypass da transicao para `/planos`

- Mudanca: `shouldSkipRouteTransition` ignorando animacao em `/planos`.
- Resultado: travamento parou, mas **perdeu animacao** (nao atende requisito).

### 5) Reativacao da animacao com efeito dependente de `pathname`

- Mudanca: efeito de transicao com `useEffect(..., [pathname])`, forcar `setPhase("loading")` em cada troca.
- Resultado: animacao voltou, porem **travamento voltou**.

### 6) Versao sem overlay (somente reveal de conteudo)

- Mudanca: remover overlay/spinner e manter apenas animacao de conteudo.
- Resultado: travamento parou, mas UX degradou (conteudo montando na frente), **rejeitado**.

### 7) Restauracao do spinner com watchdog de seguranca

- Mudanca: voltar `loading -> revealing -> done` + `SAFETY_TIMEOUT_MS` para forcar `done`.
- Resultado: **nao resolveu** no teste real reportado pelo usuario.

### 8) Guardas globais de back/forward (marcacao temporal)

- Mudanca: listeners globais (`popstate`, `pageshow`) com marca de navegação recente para bypass de transicao.
- Resultado: testes automatizados passaram, mas no fluxo real reportado **ainda nao resolveu**.

## Testes automatizados criados/ajustados durante a investigacao

- `apps/web/src/lib/page-shell-navigation.spec.ts`
- `apps/web/src/lib/planos-navigation.spec.ts`
- `apps/web/src/lib/route-transition-bfcache.spec.ts`
- `apps/web/src/lib/route-transition-template.spec.ts`

Observacao: os testes acima validam presenca de guardas e estrutura de transicao, mas **nao reproduzem fielmente** o comportamento real de back/forward observado no navegador.

## Estado atual do problema

- Continua ocorrendo para o usuario no fluxo logado `/planos -> /adaptar -> voltar`.
- Necessario corrigir mantendo:
  - spinner bloqueando ate liberar
  - animacao de entrada
  - sem travamento em navegacao back/forward

## Restricoes para a proxima iteracao

- Nao aceitar fix que remova spinner.
- Nao aceitar fix que desative animacao de entrada na rota alvo.
- Nao aplicar workaround especifico so para `/planos` se o problema estrutural existir em outras rotas.

## Proxima abordagem recomendada (para nova implementacao)

1. Instrumentar transicao em runtime (console/sessionStorage) com timeline de fase e eventos (`pathname`, `phase`, `pageshow`, `popstate`, timestamps).
2. Confirmar se o freeze vem de:
   - fase React nao mudando para `done`, ou
   - classe CSS/overlay ficando ativo apesar da fase.
3. Migrar para um state machine explicito com ids de navegacao e cancelamento de timers antigos (evitar atualizacao de navegação anterior sobre navegação atual).
4. Validar manualmente no fluxo real do usuario antes de expandir para outras rotas.
