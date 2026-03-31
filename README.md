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

`apps/web` preserva a base Next.js e as rotas publicas/SEO. A vaga publica ainda usa o seam atual de mock em `apps/web/src/lib/jobs.ts`, consumido por `apps/web/src/app/vagas/[slug]/page.tsx`; a troca por leituras reais da API fica para a proxima fase de ingestao. `apps/api` ja saiu do bootstrap inicial e agora expõe o primeiro slice real de backend-core: auth com JWT/refresh/social login, profile/resume ownership, catalogos de companies/job-sources e CRUD canonico de jobs com `firstSeenAt`. Os pacotes em `packages/*` seguem como base compartilhada, com `packages/database` agora sendo a fonte de verdade do schema Prisma, migrations, seed e client.

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

## Verificacao do backend-core slice 1

Os comandos abaixo foram validados na raiz deste worktree e devem ser executados de forma sequencial:

```bash
npm run generate --workspace @earlycv/database
npm run lint
npm run check
npm run build
npm run test
npm ls --workspaces --depth=0
```

`generate` precisa rodar antes da verificacao completa quando o schema Prisma mudar. `build` e o caminho compilado de `start` ainda recompilam artifacts compartilhados em `packages/*`, e `test` recompila a API quando necessario; por isso, a verificacao final deve evitar rodar esses comandos em paralelo.

## Variaveis de ambiente

Use `.env.example` como referencia para os valores compartilhados entre web, API, banco, Redis e S3/MinIO. O arquivo tambem inclui o surface atual obrigatorio da API para auth (`JWT_*`) e OAuth (`GOOGLE_*`, `LINKEDIN_*`), alem de exemplos especificos da camada web (`NEXT_PUBLIC_*`) e um bloco explicitamente marcado como exemplo de provider de IA com OpenAI.

```bash
cp .env.example .env
```

- `APP_URL` e `API_URL` representam endpoints compartilhados do monorepo
- `API_HOST`, `API_PORT`, `JWT_*`, `GOOGLE_*` e `LINKEDIN_*` sao necessarios para subir `apps/api` com o slice atual
- `NEXT_PUBLIC_*` existe para o app web quando essas URLs precisarem ser expostas no bundle cliente
- `OPENAI_*` e nomenclatura especifica do provider OpenAI; se o provider mudar no futuro, esse bloco deve mudar junto

## Worktrees locais

Este repositorio usa `.worktrees/` como convencao para worktrees locais do Git. O diretorio fica ignorado no root para permitir branches de trabalho isoladas sem poluir o status do repositorio principal.

## Estado atual da migracao

- a raiz funciona como orquestradora de workspaces npm para web, API e pacotes compartilhados
- `apps/web` abriga o app Next.js com rotas publicas indexaveis e pagina de vaga server-rendered, ainda alimentada pelo seam atual em `apps/web/src/lib/jobs.ts` e `apps/web/src/app/vagas/[slug]/page.tsx`
- `apps/api` agora integra `EnvModule`, `DatabaseModule`, `InfraModule`, `HealthModule`, `AuthModule`, `ProfilesModule`, `ResumesModule`, `CompaniesModule`, `JobSourcesModule` e `JobsModule`
- `apps/api` ja cobre register/login/refresh/logout/me, Google + LinkedIn social login, profile/resume ownership e CRUD autenticado para companies, job-sources e jobs
- `packages/database` contem schema Prisma real, migration inicial, seed local e invariantes para auth/profile/resume/company/job-source/job
- `first_seen_at` ja existe como campo obrigatorio persistido em `Job` e deve continuar visivel nas proximas fases
- o proximo passo do backend e a fase de ingestao: adapters de crawler, runs, snapshot diff, normalizacao e job upsert/deduplicacao sobre o schema atual
