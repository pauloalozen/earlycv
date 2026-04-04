# Backend Core Slice 1 Handoff

## Built today

- `packages/database` virou a fonte de verdade do schema Prisma para auth, profile, resume, company, job source e job.
- `apps/api` agora sobe com `AuthModule`, `ProfilesModule`, `ResumesModule`, `CompaniesModule`, `JobSourcesModule` e `JobsModule` integrados no `AppModule`.
- O slice atual cobre register/login/refresh/logout/me, Google + LinkedIn social login, profile/resume ownership e CRUD autenticado para companies, job-sources e jobs.
- `Job.firstSeenAt` e `Job.canonicalKey` ja estao persistidos e devem continuar estaveis para a fase seguinte.

## Context that matters tomorrow

- `apps/web` ainda usa mock em `apps/web/src/lib/jobs.ts`; nao trocar para API antes da ingestao produzir dados confiaveis.
- Nao existe modulo `users` separado; leitura/sanitizacao do usuario atual ficou no boundary de auth/common.
- O surface atual de env da API esta em `.env.example` e inclui `API_HOST`, `API_PORT`, `JWT_*`, `GOOGLE_*` e `LINKEDIN_*`.

## Immediate next step

- Comecar o slice de ingestao usando `Company`, `JobSource` e `Job` como base.
- Foco inicial recomendado: adapters por fonte, execucao de runs, snapshot diff, normalizacao e upsert/deduplicacao por `canonicalKey` sem mexer no schema base.

## Commands

```bash
npm run generate --workspace @earlycv/database
npm run lint
npm run check
npm run build
npm run test
npm ls --workspaces --depth=0
npm run dev:api
```

## Update 2026-04-02 - Ingestion crawler

### What got done

- Detailed design for the ingestion crawler was documented in `docs/superpowers/specs/2026-04-02-job-ingestion-crawler-design.md`.
- A full TDD implementation plan was documented in `docs/superpowers/plans/2026-04-02-job-ingestion-crawler-implementation.md`.
- Scope was locked for first real adapters (`gupy` and `greenhouse`) with capture-rule filtering and audited run metrics.
- Product invariants were reaffirmed: `canonicalKey` as identity and `firstSeenAt` as immutable first acceptance timestamp.

### Where to resume next

- Start execution from `docs/superpowers/plans/2026-04-02-job-ingestion-crawler-implementation.md:13` (Task 1).
- First concrete step: write failing schema tests for `captureRulesJson` on `JobSource` and new counters/summary fields on `IngestionRun`.
- Then add Prisma schema + migration, regenerate client, and run targeted database tests before moving to API tasks.
- Keep `apps/web` on mock jobs until ingestion tests pass and accepted jobs are stable in API.
