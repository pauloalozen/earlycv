# EarlyCV Code Guidelines

Este documento guia continuidade do projeto com o mesmo padrao de implementacao.

## 1) Principles first

- Nao inventar dados de candidato em nenhum fluxo de adaptacao.
- Preservar invariantes de vagas: `canonicalKey` estavel e `firstSeenAt` imutavel apos primeira aceitacao.
- Preferir mudancas pequenas, reversiveis e testadas.
- Seguir padroes existentes antes de introduzir novo estilo.

## 2) Repository and layer rules

- `apps/web` consome somente `apps/api`.
- `apps/api` concentra regras de negocio e acesso a infra.
- `packages/database` e a unica fonte de verdade para schema Prisma/migrations/client.
- Nao mover jobs publicos do mock para API antes do slice de ingestao estar confiavel.

## 3) Language, tooling and formatting

- Linguagem: TypeScript em todos os workspaces.
- Lint/format/check: Biome (config raiz em `biome.json`).
- CSS: Tailwind v4.
- Evitar comentarios desnecessarios; codigo deve ser legivel por nomes e estrutura.
- Preferir ASCII em texto/codigo quando possivel.

## 4) Naming conventions

### Files and folders

- Backend Nest: kebab-case por modulo (`job-sources`, `admin-users`, `resume-templates`).
- Frontend components: kebab-case (`job-card.tsx`, `search-input.tsx`).
- DTOs e classes: `PascalCase` (`CreateJobSourceDto`).
- Tipos/funcoes/variaveis: `camelCase`.
- Constantes de ambiente: `UPPER_SNAKE_CASE`.

### Domain names

- Use nomes explicitos de dominio (`jobSource`, `ingestionRun`, `captureRules`).
- Evite abreviacoes opacas (`cfg`, `tmp`, `val`) em codigo de producao.

## 5) Backend (NestJS) patterns

- Organizar por modulo de dominio (`*.module.ts`, `*.controller.ts`, `*.service.ts`, `dto/*`).
- Controllers finos: validam input, delegam para service, retornam resposta.
- Services com regra de negocio e orquestracao de persistencia.
- Usar DTO com `class-validator` e `class-transformer`.
- Sanitizar entradas textuais (`trim`) em DTOs quando aplicavel.
- Erros esperados devem virar exceptions explicitas (`NotFoundException`, `ConflictException`, etc.).
- Nao vazar detalhes de infra para contratos publicos sem necessidade.

## 6) Prisma and data safety

- Alteracao de schema sempre em `packages/database/prisma/schema.prisma` + migration correspondente.
- Rodar generate apos mudanca de schema.
- Em upsert de `Job`, nunca recalcular `firstSeenAt` para registro ja existente.
- `canonicalKey` deve ser deterministicamente derivado da identidade remota da vaga.
- Para ingestao, rejeicoes por filtro nao devem poluir `Job` (persistir somente aceitas).

## 7) Frontend (Next.js App Router) patterns

### Identidade visual

A identidade das paginas voltadas ao usuario e **monocromatica escura-sobre-clara**, limpa e
direta. Nao usar laranja/terracota em paginas de usuario — esse acento esta restrito ao admin interno.

**Superficies**

| Token CSS            | Valor     | Uso                                          |
|----------------------|-----------|----------------------------------------------|
| `--background`       | `#FAFAFA` | Fundo padrao das paginas                     |
| `--background-alt`   | `#F2F2F2` | Fundo de secoes de resultado/analise         |
| `--background-dark`  | `#0E0E0E` | Blocos de CTA escuros                        |
| `--surface`          | `#FFFFFF` | Cards e areas de conteudo                    |
| `--surface-muted`    | `#F7F7F7` | Paineis internos de card (ex.: preview antes)|
| `--surface-border`   | `#E0E0E0` | Bordas gerais                                |

**Texto**

| Token CSS           | Valor     | Uso                                           |
|---------------------|-----------|-----------------------------------------------|
| `--foreground`      | `#111111` | Texto principal                               |
| `--text-secondary`  | `#666666` | Subtitulos, descricoes                        |
| `--text-muted`      | `#888888` | Texto de apoio                                |
| `--text-label`      | `#AAAAAA` | Labels de secao (uppercase tracking)          |
| `--text-placeholder`| `#BBBBBB` | Placeholders de inputs                        |

**Semanticas de diagnostico de CV**

| Token CSS      | Valor     | Uso                                      |
|----------------|-----------|------------------------------------------|
| `--score-high` | `#84cc16` | Pontos fortes, fit alto, keywords presentes |
| `--score-mid`  | `#f59e0b` | Fit medio, alertas                       |
| `--score-low`  | `#ef4444` | Lacunas, fit baixo, keywords ausentes    |

**Tipografia**

- Logo: `<span className="font-logo text-2xl tracking-tight">earlyCV</span>`
- H1 hero: `text-4xl font-medium leading-[1.05] tracking-tight` / `md:text-[56px]`
- H1 de pagina: `text-2xl/3xl font-bold tracking-tight` ou `font-medium`
- Label de secao: `text-[11px] font-bold uppercase tracking-widest text-[#AAAAAA]`
- Corpo: `text-sm` a `text-base`
- Fonte: DM Sans (body, `font-sans`), Gugi (logo, `font-logo`)

**Componentes recorrentes**

- Header padrao: `<header className="flex items-center justify-between px-10 py-6">`
- Card padrao: `bg-white shadow-sm rounded-xl p-5`
- Card hero: `bg-white shadow-sm rounded-[20px]`
- Botao primario: `bg-[#111111] text-white rounded-[14px] py-[18px] px-7 text-lg font-medium`
- Botao outline: `border border-[#DDDDDD] bg-white rounded-xl px-[18px] py-[6px] text-base font-medium`
- Chip positivo: `bg-lime-100 text-lime-800 rounded-full px-2.5 py-0.5 text-xs font-semibold`
- Chip negativo: `bg-red-100 text-red-700 rounded-full px-2.5 py-0.5 text-xs font-semibold`

**Regras gerais**

- Em rotas publicas, garantir SEO completo (metadata, canonical, OG/Twitter).
- Rotas internas/showcase: usar `noindex` por padrao.
- Componentes genericos em `apps/web/src/components/ui` devem seguir regras locais de `apps/web/src/components/ui/AGENTS.md`.
- Em `ui`, usar named exports (sem `default export`).
- Para componentes interativos reutilizaveis, usar `forwardRef` quando fizer sentido.

## 8) API client and server-side web usage

- Helpers server-only em `apps/web/src/lib/*` quando dependem de token/sessao.
- Centralizar chamada HTTP em funcao unica (ex.: `apiRequest`) e tipar payload/response.
- Em erro de API, retornar mensagem acionavel e consistente.

## 9) Testing and verification

- Preferir TDD no desenvolvimento de features e bugfixes.
- Comecar por testes direcionados no modulo alterado; expandir para suite de workspace quando estabilizar.
- Comandos comuns:
  - `npm run test --workspace @earlycv/api -- <arquivos>`
  - `npm run test --workspace @earlycv/database -- src/schema.spec.ts`
  - `npm run check --workspace @earlycv/api`
  - `npm run check --workspace @earlycv/web`
- Antes de concluir trabalho relevante, validar ao menos `check`, `build` e `test` do escopo impactado.

## 10) Git and change hygiene

- Nao reverter mudancas do usuario sem pedido explicito.
- Evitar refactor amplo sem necessidade direta do objetivo.
- Commits pequenos e tematicos, com mensagem clara de intencao.
- Documentar decisoes relevantes em `specs/` ou `docs/` quando mudarem direcao tecnica.

## 11) Handoff protocol for Claude

- Ao retomar projeto, ler nesta ordem:
  1. `AGENTS.md`
  2. `specs/backend-core-slice-1-handoff.md`
  3. `docs/superpowers/specs/2026-04-02-job-ingestion-crawler-design.md`
  4. `docs/superpowers/plans/2026-04-02-job-ingestion-crawler-implementation.md`
- Continuar do proximo item nao concluido do plano de ingestao, sem reabrir fundacao.
- Manter foco no slice atual antes de iniciar novas frentes.
