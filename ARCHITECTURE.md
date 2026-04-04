# EarlyCV Architecture

## Product guardrails (non-negotiable)

- EarlyCV e um SaaS copilot para candidaturas no Brasil, com foco inicial em tecnologia, dados, produto, analytics/BI e funcoes digitais adjacentes.
- Nunca inventar fatos de carreira (experiencias, cargos, resultados, certificacoes, tecnologias ou responsabilidades).
- `first_seen_at` / `firstSeenAt` e sinal central do produto e deve permanecer visivel em modelagem, ranking, alertas e UX quando relevante.
- Para jobs, `canonicalKey` e a identidade de deduplicacao e `firstSeenAt` deve permanecer estavel apos a primeira aceitacao.

## Monorepo layout

```text
apps/
  web/        # Next.js App Router (publico + backoffice)
  api/        # NestJS, regras de negocio e orquestracao
packages/
  config/     # configs compartilhadas
  database/   # Prisma schema, migrations, seed, client
  queue/      # fila/jobs
  storage/    # S3/MinIO
  ai/         # clientes e fluxos de IA
specs/        # especificacoes de produto/arquitetura
docs/         # docs operacionais, planos e handoffs
```

## System boundaries

- `apps/web` fala apenas com `apps/api`.
- `apps/api` concentra regras de negocio e integra infraestrutura (database, queue, storage, AI).
- `packages/database` e fonte de verdade do schema e geracao Prisma.
- Componentes UI reutilizaveis devem convergir para pacote compartilhado; enquanto isso, ficam em `apps/web/src/components/ui`.

## Runtime architecture

- **Web:** Next.js 16 App Router, SSR para rotas publicas e backoffice server-side.
- **API:** NestJS modular (`AppModule` agrega auth, profiles, resumes, companies, job-sources, jobs e superficies admin/superadmin).
- **DB:** Postgres via Prisma.
- **Auth:** JWT + refresh + social login (Google, LinkedIn).
- **Styling:** Tailwind CSS v4.
- **Quality:** Biome (`lint` + `check`) e testes por workspace.

## Current domain modules

- Auth + sessao
- Profiles + resumes (ownership por usuario)
- Companies + job-sources
- Jobs canonicos com `canonicalKey` e `firstSeenAt`
- Ingestion manual base com runs e preview (slice inicial)

## Ingestion direction (next critical slice)

- Estado atual e handoff: `specs/backend-core-slice-1-handoff.md`.
- Design crawler: `docs/superpowers/specs/2026-04-02-job-ingestion-crawler-design.md`.
- Plano TDD: `docs/superpowers/plans/2026-04-02-job-ingestion-crawler-implementation.md`.
- Primeiros adapters reais: `gupy` e `greenhouse`.
- Regras por fonte (capture policy): incluir/excluir vagas digitais antes de persistir em `Job`.
- Runs devem expor metricas operacionais (`discovered`, `accepted`, `filtered`, `failed`) com diagnostico.
- Nao trocar `apps/web` para jobs reais enquanto ingestao nao estiver confiavel.

## SEO and indexing policy

- Toda rota publica deve sair com metadata completa, canonical, OG/Twitter, robots e structured data quando fizer sentido.
- Vagas publicas devem ser renderizadas no servidor com `JobPosting` estruturado.
- Rotas internas, utilitarias e showcase normalmente devem usar `noindex`.

## Environment surface (API required)

- `DATABASE_URL`
- `API_HOST`, `API_PORT`
- `JWT_*`
- `GOOGLE_*`
- `LINKEDIN_*`

Referencia: `.env.example`.

## Architectural decisions to preserve

1. Manter separacao estrita web -> api -> infra.
2. Evitar logica de negocio em camada de UI.
3. Evitar acoplamento de componentes genericos a paginas especificas.
4. Tratar `firstSeenAt` e `canonicalKey` como invariantes de produto.
5. Evoluir por slices pequenos com testes direcionados antes de ampliar escopo.

## Verification workflow (default)

Executar da raiz quando houver mudancas relevantes:

```bash
npm run check
npm run generate --workspace @earlycv/database
npm run build
npm run test
```

Para fluxo focado em API/web, usar tambem comandos por workspace quando necessario.
