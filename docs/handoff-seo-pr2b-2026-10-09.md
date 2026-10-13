# Handoff: SEO PR 2b (retomada)

Data: 2026-10-09. Ler este arquivo inteiro antes de começar.

## Onde paramos

- PR #63 (SEO PR 1, só apps/web): mergeado em develop.
- PR #64 (SEO PR 2a, branch `feature/seo-2a-ciclo-de-vida`): mergeado em develop em 2026-10-09, merge commit `6db8155`. Ainda não foi para main/prod.
- Próximo trabalho: PR 2b, branch nova a partir de develop atualizado (`git checkout develop && git pull`).

## O que o PR 2a entregou (base para o 2b)

- Fila da Indexing API: tabela `GoogleIndexingQueueItem` (pendingKey único por slug, status pending/done/failed/skipped), worker `google-indexing-queue.worker.ts` (@Cron a cada minuto no segundo 30, lock `google-indexing-queue`, 20 envios por execução, até 5 attempts, retenção 30 dias). Cota em `indexing-quota.ts` (dia do Pacífico, `GOOGLE_INDEXING_BACKFILL_DAILY_LIMIT` default 200). Com `GOOGLE_INDEXING_ENABLED=false` só enfileira.
- Prioridades (`INDEXING_PRIORITY`): deleted 0, newJob 10, backfill 20.
- Inativação centralizada: `apps/api/src/jobs/job-lifecycle.service.ts` (`closeJobs`, `activateJobs`, `onStatusChanged`, `revalidateAfterCommit`). Todo caminho que muda status de vaga passa por ele. Scripts usam `buildScriptJobLifecycle` (`scripts/support-job-lifecycle.ts`).
- `JobStatus.pending_review` + `Job.reviewApprovedAt` + tela admin "Vagas em Revisão" (`/admin/vagas-em-revisao`).
- `JobSource.isGlobalBoard` (8 fontes greenhouse marcadas na migration).
- `classifyJobLocation` em `geo-normalizer.ts` (brazil/foreign/review). Ingestão: foreign → não entra; review sem aprovação → pending_review.

## Rollout do 2a em produção (pendente, Paulo conduz)

1. Deploy com a fila (develop → main).
2. `foreign-jobs-cleanup` em dry-run em prod; Paulo aprova a lista. (Dry-run local deu 56 ativas + 107 inativas estrangeiras, 18 para revisão, 77 ambíguas.)
3. Apply.
4. Só depois desativar as fontes erradas pelo caminho de pausar fonte: colabsoftware, navapbc, scoutmotors, waymo, seed, solutions. Datadog é board global, NÃO desativar.

## Escopo do PR 2b (decisões já aprovadas, não rediscutir)

5. Slug com 308 via cuid (decisão A, restrito): regenerar slug só das vagas com `[Job-` no título e das de empresa reatribuída; enfileirar URL_UPDATED prioridade 20.
6. Normalizador de título: remover `^\[Job-\d+\]\s*` (Lever da CI&T) + backfill.
7. Parser de localização: lista IBGE, `jobLocation` como lista de até 3 cidades (texto com "ou"/"e"); códigos IATA (SAO, CWB, POA, RIO, BSB, BHZ, REC, FOR, SSA, FLN, CPQ); sem match → só país BR. "Remote" puro com workModel errado → backfill workModel=remote. Conectivos em caixa ("Taboão Da Serra"). 386 vagas públicas sem cidade/estado.
8. `Company.displayName` em `@earlycv/config` (packages/config), corrigindo apóstrofo ("LET'S RENT A CAR"), editável no admin. Hoje o front usa `companyDisplayName` em radar-landings.ts.
9. Tipo de contratação (decisão F): `employmentTypeRaw` + `employmentType` normalizado na ingestão; "Homeoffice" omitido (já é remote).
10. Talent pool detectado por título/slug (46 vagas a mais).
11. Helper para cargo em caixa alta com mapa de termos técnicos (DevOps, iOS, QA, SAP, BI, UX, UI, SRE, ML, IA, AI, TI, RH).
12. Tirar travessões das meta descriptions: analise-de-curriculo, carta-de-apresentacao, gestao-de-candidaturas, posts artigo-2, artigo-4 e draft.

Ambiguidade: reportar, não improvisar.

## Regras da sessão

- Script do beBee rodando em background até ~22h de 09/10: não parar/recriar o container `app-postgres-1`, não mexer em `apps/api/.cache/`, não matar processos node que não subi, nada de `migrate reset`/`db push --force-reset`. (Conferir se ainda está rodando antes de relaxar.)
- Copy sem travessão; sempre "você".
- Worker = @Cron + lock via IngestionLockRepository; campo de retry = `attempts`.
- Migration nova: `npm run railway:touch-api` e commitar `.railway-redeploy`. Aplicar em earlycv_homolog e earlycv_test.
- Rodar só specs tocados + typecheck; biome a partir da raiz.
- Falhas pré-existentes (não são regressão): 3 em job-sources.e2e-spec, 4 em web admin/ingestion/actions.test.ts, blog-pages "renders markdown semantics", typecheck web com 94 erros.

## Subir local sem efeitos colaterais

API (em apps/api, com sh porque o .env não carrega no zsh):

```
sh -c 'set -a && . ../../.env && set +a && export NODE_ENV=test RESEND_API_KEY= OPENAI_API_KEY= OPENROUTER_API_KEY= SES_EMAIL_ENABLED=false GOOGLE_INDEXING_ENABLED=false && exec npx nest start'
```

Web: build e `npx next start -p 3000`.
