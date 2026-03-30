# EarlyCV

EarlyCV e um SaaS copilot para candidaturas no Brasil. A proposta e descobrir vagas antes da maioria, explicar a aderencia entre perfil e oportunidade e adaptar curriculos sem inventar fatos.

Em vez de depender apenas dos grandes portais quando a disputa ja escalou, o produto ajuda a monitorar sinais mais cedo, priorizar onde vale investir tempo e organizar uma busca mais estrategica para tecnologia, dados, produto, analytics/BI e funcoes digitais adjacentes.

## Proposta de produto

- descobrir vagas com antecedencia e destacar o `first_seen_at` como sinal de produto
- explicar aderencia entre vaga e historico real da pessoa candidata
- apoiar adaptacoes de curriculo com rastreabilidade, sem inventar experiencias ou resultados
- organizar alertas, acompanhamento e priorizacao para diferentes estrategias de busca

## Estrutura do monorepo

Este repositorio ja roda como monorepo npm com workspaces em `apps/*` e `packages/*`.

```text
.
|- apps/
|  |- web/        # experiencia web publica e autenticada
|  \- api/        # regras de negocio, ingestao e integracoes
|- packages/
|  |- config/     # configuracoes compartilhadas
|  |- database/   # schema, migracoes e utilitarios de banco
|  |- queue/      # jobs e filas
|  |- storage/    # S3/MinIO e arquivos
|  \- ai/         # clientes e fluxos de IA
|- docker-compose.yml
|- specs/
|- .env.example
\- package.json   # orquestrador de workspaces
```

`apps/web` preserva a base Next.js e as rotas publicas/SEO. Nesta fundacao, a vaga publica ainda usa o seam atual de mock em `apps/web/src/lib/jobs.ts`, consumido por `apps/web/src/app/vagas/[slug]/page.tsx`; a troca por contratos lidos da API fica para a proxima fase `backend-core`. `apps/api` fornece o bootstrap NestJS inicial com modulos de ambiente, healthcheck e servicos internos de diagnostico de infraestrutura; a orquestracao de jobs, matching, tailoring, alerts, notifications e audits entra na fase `backend-core`. Os pacotes em `packages/*` expoem os contratos e scaffolds compartilhados usados pelos apps.

## Principios de arquitetura

- `apps/web` fala apenas com `apps/api`
- `apps/api` centraliza regras de negocio e a orquestracao da infraestrutura
- componentes reutilizaveis migram para pacotes compartilhados conforme a base evolui
- SEO e requisito de produto: rotas publicas precisam de metadata completa, canonical, OG/Twitter e structured data quando fizer sentido

## Comandos do root

Todos os comandos abaixo devem ser executados a partir da raiz do repositorio.

Os scripts de root e dos workspaces assumem um shell Unix-like (`sh`/`bash`), porque usam condicionais, background jobs e utilitarios nesse formato.

Os pacotes compartilhados agora expõem `development` + `types` a partir de `src`, mantendo `default` em `packages/*/dist`. Na pratica, `@earlycv/api` resolve codigo-fonte diretamente em `dev`, `check`, `test` e `build`, sem depender de `dist` preexistente; o caminho compilado (`npm start --workspace @earlycv/api`) continua usando `prestart` para gerar artifacts compartilhados antes de subir a versao JS final. No root, apenas `postinstall` e `prebuild` continuam disparando `build:packages` por conveniencia do fluxo compilado.

| Comando | Uso |
| --- | --- |
| `npm install` | instala dependencias do root e prepara os workspaces |
| `npm run dev:web` | sobe o app web em `apps/web` via workspace `@earlycv/web` |
| `npm run dev:api` | sobe a API no workspace `@earlycv/api` |
| `npm run dev` | orquestra `@earlycv/web` + `@earlycv/api` |
| `npm run build` | precompila os pacotes compartilhados e depois executa `build` de API + web |
| `npm run start` | sobe a aplicacao web a partir do workspace `@earlycv/web` |
| `npm run lint` | roda `biome lint .` na raiz e depois executa `lint` em todos os workspaces |
| `npm run check` | roda `biome check .` na raiz e depois executa `check` em todos os workspaces |
| `npm run test` | roda os testes definidos em todos os workspaces |
| `npm run db:generate` | delega geracao do banco para `packages/database` |
| `npm run db:migrate` | delega migracoes para `packages/database` |
| `npm run compose:up` | sobe infraestrutura local via Docker Compose quando os arquivos existirem |
| `npm run compose:down` | derruba a infraestrutura local via Docker Compose |
| `npm ls --workspaces --depth=0` | lista os workspaces atualmente detectados pelo npm |

## Verificacao final da fundacao

Os comandos abaixo foram validados na raiz deste worktree e devem ser executados de forma sequencial:

```bash
npm run lint
npm run check
npm run build
npm run test
npm ls --workspaces --depth=0
```

`build` e o caminho compilado de `start` ainda recompilam artifacts compartilhados em `packages/*`, e `test` recompila a API quando necessario; por isso, a verificacao final deve evitar rodar esses comandos em paralelo.

## Variaveis de ambiente

Use `.env.example` como referencia para os valores compartilhados entre web, API, banco, Redis e S3/MinIO. O arquivo tambem inclui exemplos especificos da camada web (`NEXT_PUBLIC_*`) e um bloco explicitamente marcado como exemplo de provider de IA com OpenAI.

```bash
cp .env.example .env
```

- `APP_URL` e `API_URL` representam endpoints compartilhados do monorepo
- `NEXT_PUBLIC_*` existe para o app web quando essas URLs precisarem ser expostas no bundle cliente
- `OPENAI_*` e nomenclatura especifica do provider OpenAI; se o provider mudar no futuro, esse bloco deve mudar junto

## Worktrees locais

Este repositorio usa `.worktrees/` como convencao para worktrees locais do Git. O diretorio fica ignorado no root para permitir branches de trabalho isoladas sem poluir o status do repositorio principal.

## Estado atual da migracao

- a raiz funciona como orquestradora de workspaces npm para web, API e pacotes compartilhados
- `apps/web` abriga o app Next.js com rotas publicas indexaveis e pagina de vaga server-rendered, ainda alimentada pelo seam atual em `apps/web/src/lib/jobs.ts` e `apps/web/src/app/vagas/[slug]/page.tsx`
- `apps/api` abriga o bootstrap NestJS inicial com healthcheck e diagnostico interno dos pacotes compartilhados; os modulos de dominio e a orquestracao principal ficam para `backend-core`
- `packages/config`, `packages/database`, `packages/queue`, `packages/storage` e `packages/ai` existem, compilam e possuem verificacoes basicas
- `first_seen_at` continua sendo um invariante esperado do produto, mas o campo/modelo real ainda nao existe nesta fundacao; isso entra na fase `backend-core`
- scripts de root refletem o estado atual do monorepo e a fundacao pode ser usada como base para a proxima fase `backend-core`
