# Deploy escuro — pipeline de perfil canônico de CV (Fase 3A)

**Data:** 2026-09-05
**Escopo:** preparar e validar localmente, sem tocar nenhuma infraestrutura real, a ordem exata de operações para um deploy real seguro do estado atual da branch `feature/cv-canonical-profile-pipeline` (HEAD `18a1189`) — flag global desligada, allowlist vazia, zero mudança de comportamento observável em produção.
**Referência:** `docs/specs/2026-09-04-cv-canonical-profile-pipeline-plan.md` (v3).

---

## 0. Contexto real da branch (correção de um erro deste próprio relatório)

**Correção**: uma versão anterior deste documento afirmava que "`main` (produção) já está no commit `b87e0eb`" e que "todas as Fases 1 a 2G já estão em produção". **Isso é falso e foi corrigido.** O que existe é um branch LOCAL chamado `main` neste checkout, apontando pra `b87e0eb` — mas isso é só onde o trabalho foi commitado localmente antes de existir uma branch dedicada (`feature/cv-canonical-profile-pipeline`, criada depois, no mesmo ponto). **`origin/main` (o que está de fato em produção) continua em `54a3838`, sem nenhum commit desta feature.** Nenhum `git push` para `origin/main` foi feito em nenhum momento deste trabalho. Nada do pipeline canônico de CV (Fases 1 a 2G, nem esta 3A) está em produção ainda.

A branch `feature/cv-canonical-profile-pipeline` contém os 8 commits das Fases 1–2G MAIS este trabalho da Fase 3A/correção de `set-primary` (`18a1189`) — todos ainda não pushados pra `origin/main`, todos pendentes da decisão do usuário sobre quando e como fazer o merge/deploy real. O "deploy escuro" descrito abaixo é a preparação para ESSE deploy futuro (a feature inteira, não só o último commit), ainda não executado.

---

## 1. Ordem exata de operações para o deploy real

1. **Migrations** — **nenhuma delas está em produção ainda**; um deploy real precisa aplicar as 6, na ordem em que foram criadas, todas já aditivas e testadas nas fases anteriores:
   - `20260904220951_cv_canonical_profile_pipeline_phase1` (Fase 1 — schema completo do pipeline)
   - `20260904222812_cv_canonical_profile_pipeline_phase1_corrective` (CHECK `talent_profile_requires_owner` NOT VALID + `CvSource.talentSubject` Restrict)
   - `20260905130000_talent_profile_user_delete_cascade`
   - `20260905131500_analysis_job_succeeded_requires_ready_profile`
   - `20260905140000_talent_subject_merge_reason_legacy_profile_adopted`
   - `20260905150000_cv_processing_job_resume_id` — `ALTER TABLE "CvProcessingJob" ADD COLUMN "resumeId" TEXT` + FK `ON DELETE SET NULL` + índice. Coluna nullable, sem backfill, zero linha existente afetada.
   - Railway já está configurado para rodar `prisma migrate deploy` antes de subir o processo (`apps/api/package.json#start` → `npm run deploy --workspace @earlycv/database && node dist/main.js`, e `deploy` = `prisma migrate deploy`) — nenhuma ação manual extra é necessária além do merge/push real, quando ele acontecer.
   - `apps/api/.railway-redeploy` já foi tocado dentro da própria feature (convenção do projeto respeitada) — Railway detecta a mudança em `apps/api/**` e dispara redeploy quando o merge/push acontecer.
2. **Código** — deploy da API com o conteúdo inteiro da branch `feature/cv-canonical-profile-pipeline` (merge `feature/cv-canonical-profile-pipeline` → `main`, e só então push de `main` para `origin/main` — decisão e execução exclusivas do usuário, ainda não tomada).
3. **Flag global desligada** — `CV_STRUCTURED_PROFILE_PIPELINE_ENABLED` **não** deve ser setada (ou `"false"`) nas variáveis de ambiente do Railway. Confirmado por leitura de `cv-processing.flags.ts`: default é `false` quando a env var não é exatamente a string `"true"`.
4. **Allowlist vazia** — `CV_STRUCTURED_PROFILE_PIPELINE_ALLOWLIST_USER_IDS` não deve ser setada (ou vazia). Confirmado em `cv-processing-flag-resolver.service.ts#parsePipelineAllowlistUserIds`: string vazia/ausente → `Set` vazio → `isUserIdInPipelineAllowlist` sempre `false`.
5. **Caminho legado ativo para todo mundo** — provado por leitura de código (não só afirmado):
   - `app.module.ts` agora importa `CvProcessingModule` **incondicionalmente** (achado da própria Fase 3, documentado no commit: o módulo já era efetivamente sempre carregado desde a Fase 2G via `ResumesModule`/`CvAdaptationModule`, a condicional em `app.module.ts` era mais morta do que parecia).
   - Isso significa: o pipeline novo **fica disponível** (DI resolvida, worker de cron rodando), mas **cada entrypoint decide, por request, se usa o pipeline novo ou o legado**, via `CvProcessingFlagResolverService#isEnabledFor()`.
   - Com flag global desligada e allowlist vazia, `isEnabledFor()` só retorna `true` para `userId` de usuário com `internalRole` `admin`/`superadmin`. Para todo o restante (guest e usuário comum), retorna `false` → os 4 entrypoints (`resumes.service.ts#create`, `cv-adaptation.service.ts#startAuthenticatedAnalysisJob`, `#startGuestAnalysisJob`, `claimGuestAnalysisJob`, `resumes.service.ts#setPrimary`) seguem 100% o caminho legado de sempre.
   - **Guest nunca é elegível nesta fase**, mesmo que o mecanismo de allowlist crescesse — `isEnabledFor()` retorna `false` sempre que `context.userId` está ausente, por decisão deliberada documentada no cabeçalho do arquivo.
6. **Nenhuma execução automática de backfill** — confirmado por busca: não existe `onModuleInit`/`OnModuleInit` em `apps/api/src/cv-processing/` nem `apps/api/src/talent-subjects/`; o único `onModuleInit` relacionado a este domínio é `database.service.ts` (`$connect`, sem relação com backfill). Nenhum script de backfill (`talent:backfill-profiles`, etc.) é referenciado em `package.json#start`/`predev`/`prestart` nem em qualquer config do Railway. Backfill (Fase 4 do plano) é sempre um comando manual (`npm run <script> -- --dry-run`), nunca parte do boot.
7. **Nenhum job novo para usuários não autorizados** — decorre diretamente de (5), e foi **provado empiricamente** na seção de validação abaixo: os 4 fluxos legados exercitados via teste de integração real não criaram nenhum `CvProcessingJob`/`AnalysisJob.cvProcessingJobId` novo.

---

## 2. Validação local — resultado item a item

Ambiente: Postgres local real (`earlycv_homolog` para o boot real do processo; `earlycv_test` para os testes de integração dos fluxos legados). `CV_STRUCTURED_PROFILE_PIPELINE_ENABLED` e `CV_STRUCTURED_PROFILE_PIPELINE_ALLOWLIST_USER_IDS` confirmadas ausentes em `.env`/`.env.test` (`grep` não retornou nada).

1. **Boot real da API** — `npm run build` (nest build) + `node dist/main.js`, `DATABASE_URL` apontando para `earlycv_homolog` local, flag/allowlist explicitamente `unset` no shell antes de subir. Log terminou em `[NestApplication] Nest application successfully started`; `curl http://localhost:4000/api/health` → `200`. Processo derrubado ao final (`kill`, confirmado `lsof -i :4000` vazio e nenhum `dist/main.js` remanescente).
2. **DI de `ResumesModule`, `CvProcessingModule` e workers** — mesmo boot acima: nenhuma linha de erro/exception no log completo (`grep -i "error\|exception\|UnknownDependencies\|Nest can't resolve"` → nenhum resultado), `CvProcessingJobsController {/api/cv-processing-jobs}` mapeado corretamente. Este é exatamente o boot real que teria pego o bug da Fase 2G (import faltante em `resumes.module.ts`) — confirmado que o import está presente e resolve sem erro.
3. **Migrations aplicadas** — `npx prisma migrate status` contra `earlycv_homolog` e `earlycv_test`: **"Database schema is up to date!"** em ambos (91 migrations, nenhuma pendente).
4. **Workers vivos sem tráfego** — com o processo rodando ~25s (cron do `CvProcessingWorker` a cada 15s, `BASE_TICK_CRON = "*/15 * * * * *"`), nenhum erro no log após múltiplos ticks; `SELECT count(*) FROM "CvProcessingJob"` no `earlycv_homolog` permaneceu `0` durante e depois do boot — o worker rodou (`acquire`/`release` do lock, `findPending` retornando vazio) sem processar nada e sem lançar exceção.
5. **Análise legada autenticada** — teste de integração real (`AppModule` completo via `Test.createTestingModule` + `supertest`, Postgres real): `POST /cv-adaptation/analyze succeeds regardless of analysisCreditsRemaining` → **passou** (`cv-adaptation.e2e-spec.ts`).
6. **Análise legada guest** — `POST /cv-adaptation/analyze-guest returns a pending job and scopes polling to the guest session` → **passou**.
7. **Claim legado** — `POST /cv-adaptation/analysis-jobs/:jobId/claim materializes CvAdaptation from the already-processed AnalysisJob, without reprocessing, and keeps the snapshot linked (survives the 30-day cleanup)` → **passou**.
8. **Upload de Master legado** — `POST /api/resumes accepts turnstileToken for master CV uploads` → **passou**.
9. **Invariantes do banco** (`earlycv_test`), antes e depois de rodar os 4 testes acima:

   | Invariante | Antes | Depois |
   |---|---|---|
   | `CvMasterDesignation` com mais de uma designação ativa por dono | 0 linhas | 0 linhas |
   | `AnalysisJob` succeeded via pipeline novo sem `CvStructuredProfile READY` | 86 (pré-existente, ver nota) | 86 (inalterado) |
   | `TalentProfile` sem dono (`userId` e `talentSubjectId` nulos) | 106 (pré-existente, ver nota) | 106 (inalterado) |

   Mesma checagem em `earlycv_homolog` (baseline limpo, sem fixtures acumuladas de testes): `TalentProfile` sem dono = **187** (bate exatamente com o número documentado no plano, seção 12, migration `20260904222812` — gap legado conhecido, `CHECK ... NOT VALID`, pendente de backfill na Fase 4); `AnalysisJob` succeeded inválido = **0**; múltiplas designações ativas = **0**.

   **Nota sobre os 86/106 em `earlycv_test`**: são registros acumulados de execuções anteriores da suíte de testes desta feature (fixtures de fases passadas, nunca limpas do banco de teste compartilhado), **não** algo criado por esta validação — confirmado porque os números não mudaram entre o antes e o depois dos 4 fluxos exercitados. São consistentes com o próprio design do plano (seção 12, Fase 5): o `CHECK`/trigger de `AnalysisJob succeeded requires ready profile` só vale para linhas novas a partir da migration que o criou — nunca retroativo a linhas já existentes antes dela.

10. **Ausência de crescimento nas filas novas** (`earlycv_test`), antes e depois dos 4 fluxos legados exercitados:

    | Métrica | Antes | Depois | Delta |
    |---|---|---|---|
    | `CvProcessingJob` (total) | 2109 | 2109 | **0** |
    | `AnalysisJob` com `cvProcessingJobId` preenchido | 1422 | 1422 | **0** |

    Confirma que os 4 fluxos legados, com flag desligada e allowlist vazia, usando usuários de teste comuns (não admin, não allowlist), **não criaram nenhum `CvProcessingJob`/`AnalysisJob` do pipeline novo** — o resolver de flag (`CvProcessingFlagResolverService#isEnabledFor`) manteve os 4 entrypoints 100% no caminho legado, exatamente como projetado.

---

## 3. Processos subidos e derrubados

Um único processo real da API (`node dist/main.js`, PID efêmero) foi subido contra `earlycv_homolog` local para os itens 1/2/4, e derrubado (`kill`) ao final — confirmado `lsof -i :4000` vazio e nenhum processo `dist/main.js` remanescente. Nenhum outro servidor (web, worker isolado) foi subido. Os testes de integração (itens 5-8) rodam e encerram seu próprio processo `tsx --test` sem deixar nada residente.

---

## 4. Riscos e lacunas reais encontradas

- **Nenhum risco novo bloqueante encontrado.** A migration desta fase é puramente aditiva (coluna nullable + FK + índice) e já estava aplicada em ambos os bancos locais antes mesmo desta validação começar.
- **Gap pré-existente, já documentado no plano** (não introduzido por esta fase): 187 `TalentProfile` sem dono em `earlycv_homolog` (e 106 em `earlycv_test`, mais fixtures de teste acumuladas) — coberto por `CHECK talent_profile_requires_owner NOT VALID`, backfill fica para a Fase 4. Não é afetado por este deploy.
- **Observação operacional, não um bug**: `earlycv_test` acumulou ~2100 `CvProcessingJob`/1400 `AnalysisJob` de execuções anteriores da suíte desta feature ao longo das fases. Não afeta a correção do código (os testes são independentes por fixture com e-mails únicos), mas vale considerar um reset do banco de teste local antes da próxima rodada de trabalho, por higiene.
- **Nenhuma variável de ambiente nova exige ação manual no Railway além do já documentado em `.env.example`** (`CV_STRUCTURED_PROFILE_PIPELINE_ENABLED=false`, `CV_STRUCTURED_PROFILE_PIPELINE_ALLOWLIST_USER_IDS=` vazia) — já commitadas no próprio `18a1189`.

---

## 5. Confirmações de segurança

- Nenhum `git push` foi executado em nenhum momento desta tarefa.
- Nenhuma infraestrutura real (Railway, produção, homolog remoto) foi tocada — toda validação rodou contra Postgres local (`earlycv_homolog`, `earlycv_test`) e um processo Nest.js local, ambos derrubados/encerrados ao final.
- Nenhuma alteração de código de produto foi feita nesta tarefa — apenas leitura, validação e este documento.
