# Relatório de prontidão para implantação — pipeline de perfil canônico de CV

**Data:** 2026-09-05
**Branch:** `feature/cv-canonical-profile-pipeline` (15 commits à frente de `origin/main`, nada pushado)
**Status:** Fase 3 técnica fechada. Este documento é só um relatório — **nenhuma ação remota foi executada** pra produzi-lo (nenhum push, merge, deploy ou backfill).
**Referências:** `docs/specs/2026-09-04-cv-canonical-profile-pipeline-plan.md` (plano v3), `docs/specs/2026-09-05-cv-canonical-profile-pipeline-deploy-escuro.md` (Fase 3A), `docs/specs/2026-09-05-cv-canonical-profile-pipeline-piloto-interno-fase3b.md` (Fase 3B).

---

## 1. Lista completa dos commits (feature branch contra `origin/main`)

`origin/main` está em `54a3838`. 15 commits à frente, nesta ordem:

| # | SHA | Resumo |
|---|---|---|
| 1 | `58e1119` | Checkpoint Fase 1 + 2A + 2B — schema aditivo completo, upload de Master autenticado, storage real |
| 2 | `1b13f53` | Fase 2C — análise autenticada (arquivo/texto) ligada ao pipeline |
| 3 | `5a5ef67` | Fase 2C.1 — `inputMode: "profile"` ligado ao pipeline |
| 4 | `2d92c8d` | Fase 2D — visitante (`TalentSubject`), Master provisório |
| 5 | `82137eb` | Fase 2E — claim granular (`ClaimSourceGrant`) |
| 6 | `a104540` | Fix crítico — `TalentIdentityResolver.resolveForGuest()` nunca cria `TalentProfile` sem dono |
| 7 | `404cc5a` | Fase 2F — matriz de entrypoints, dedup de `CvProcessingJob`, defesa de banco `succeeded→READY` |
| 8 | `b87e0eb` | Fase 2G — `set-primary` integrado, auditoria e fechamento dos 3 entrypoints legados restantes |
| 9 | `18a1189` | Fix — `set-primary` só troca Master após extração pronta + ativação granular por admin/allowlist |
| 10 | `834c991` | Fase 3A — checklist de deploy escuro e validação local |
| 11 | `7d93370` | Fase 3B — piloto interno via HTTP real (achou 3 divergências Resume↔designação) |
| 12 | `db14d40` | Fase 3C parte 1 — invariante formal `Resume`↔`CvMasterDesignation`, corrige os 3 achados do piloto |
| 13 | `74e8303` | Fase 3C parte 2 — allowlist controlada de guest, claim guest→conta ponta a ponta |
| 14 | `3ce0c20` | Fix — extração canônica usa `AI_SUPPLIER_MASTERCV`, não o fallback genérico |
| 15 | `450aa41` | Fix — adapter central resolve `max_tokens` vs `max_completion_tokens` por provider/modelo |

## 2. Diffstat completo

```
67 files changed, 17986 insertions(+), 44 deletions(-)
```

Por área: `apps/api/src/cv-processing/` (módulo novo inteiro — jobs, workers, promoção de Master, claim, captura de talento, resolver de flag), `apps/api/src/talent-subjects/` (novo), extensões em `apps/api/src/cv-adaptation/`, `apps/api/src/resumes/`, `apps/api/src/talent-profiles/`, `apps/api/src/database/database.service.ts` (getters novos), `packages/ai/` (2 arquivos, fix de `max_tokens`), `packages/database/prisma/schema.prisma` + 7 migrations, `.env.example`, `apps/api/.railway-redeploy`, e 4 documentos em `docs/specs/`. Nenhum arquivo de `apps/web/` foi tocado.

## 3. Migrations, na ordem exata de aplicação

`prisma migrate deploy` aplica por timestamp crescente — já é a ordem correta:

1. `20260904220951_cv_canonical_profile_pipeline_phase1` — schema completo do pipeline (todas as tabelas novas: `CvSource`, `CvSubmission`, `CvStructuredProfile`, `CvProcessingJob`, `CvMasterDesignation`, `TalentSubject`, `ClaimSourceGrant`, observações com fingerprint, `MonitorProjectionJob`; colunas aditivas nullable em `Resume`/`AnalysisJob`/`AnalysisCvSnapshot`/`CvAdaptation`/`TalentProfile`). Zero linha existente tocada.
2. `20260904222812_cv_canonical_profile_pipeline_phase1_corrective` — `CHECK talent_profile_requires_owner (...) NOT VALID` em `TalentProfile` (não escaneia linhas existentes); `CvSource.talentSubjectId` de `Cascade` para `Restrict`.
3. `20260905130000_talent_profile_user_delete_cascade` — `TalentProfile.userId` de `SetNull` para `Cascade` (corrige exclusão de conta colidindo com a CHECK acima).
4. `20260905131500_analysis_job_succeeded_requires_ready_profile` — trigger `DEFERRABLE` exigindo `AnalysisJob succeeded` → `CvStructuredProfile READY`, só quando `cvProcessingJobId IS NOT NULL` (nunca afeta `AnalysisJob` legado).
5. `20260905140000_talent_subject_merge_reason_legacy_profile_adopted` — novo valor de enum `TalentSubjectMergeReason.LEGACY_PROFILE_ADOPTED`.
6. `20260905150000_cv_processing_job_resume_id` — coluna nullable `CvProcessingJob.resumeId` + FK `SetNull` + índice.
7. `20260905160000_cv_master_designation_integrity_defense` — trigger `DEFERRABLE` exigindo `resumeId`+ownership+`isMaster=true` pra toda designação ativa de `USER`; trigger `BEFORE DELETE` em `Resume` bloqueando exclusão de um Resume referenciado por designação ativa.

**Todas aditivas.** Nenhuma reescreve, apaga ou faz backfill de linha existente. Nenhuma tem `DOWN`/rollback automático do Prisma (convenção do projeto) — reversão é discutida na seção 7.

## 4. Variáveis de ambiente novas ou alteradas

Únicas 3 variáveis genuinamente novas nesta feature (confirmado por grep no diff completo — todas as outras ocorrências de `process.env.*` no diff são variáveis já existentes, só referenciadas em código/teste novo):

| Variável | Nova? | Default | Descrição |
|---|---|---|---|
| `CV_STRUCTURED_PROFILE_PIPELINE_ENABLED` | Sim | `false` (ausente = `false`) | Flag global. Liga o pipeline pra todo usuário autenticado quando `true`. **Nunca** liga guest sozinha (ver seção 6). |
| `CV_STRUCTURED_PROFILE_PIPELINE_ALLOWLIST_USER_IDS` | Sim | vazia | Lista de `User.id` (nunca e-mail) separada por vírgula — ativação granular por usuário. |
| `CV_STRUCTURED_PROFILE_PIPELINE_ALLOWLIST_GUEST_SESSION_HASHES` | Sim | vazia | Lista de hash SHA-256 de sessão de guest (`hashGuestSessionToken()`) separada por vírgula — ativação granular de visitante, mecanismo totalmente separado da allowlist de usuário. |

**Achado de auditoria a corrigir antes do deploy** (documentação, não bloqueante): `.env.example` documenta as duas primeiras variáveis mas **não** a terceira (`ALLOWLIST_GUEST_SESSION_HASHES`, adicionada na Fase 3C parte 2). Recomendo um commit de doc adicionando essa linha antes do merge — trivial, sem risco, mas deveria ser fechado para não deixar o `.env.example` incompleto.

Nenhuma variável existente teve seu comportamento alterado. `AI_SUPPLIER_MASTERCV`/`AI_SUPPLIER`/`AI_SUPPLIER_ANALYSIS` (já existentes) passam a ser lidas corretamente pelo pipeline novo (correção de bug, não mudança de contrato).

## 5. Valores default de todas as flags

| Flag/mecanismo | Default | Efeito no default |
|---|---|---|
| `CV_STRUCTURED_PROFILE_PIPELINE_ENABLED` | `false` | Nenhum usuário autenticado comum usa o pipeline novo |
| `CV_STRUCTURED_PROFILE_PIPELINE_ALLOWLIST_USER_IDS` | vazia | Nenhum usuário específico ligado por allowlist |
| `CV_STRUCTURED_PROFILE_PIPELINE_ALLOWLIST_GUEST_SESSION_HASHES` | vazia | Nenhuma sessão de guest ligada |
| Admin/superadmin (`User.internalRole`) | sempre ligado, sem flag | Único grupo com o pipeline ativo por padrão após o deploy — **e só se alguém já for admin, o que é uma condição de identidade existente, não uma flag nova** |

**Com a configuração recomendada de deploy (as 3 variáveis ausentes/vazias): o único jeito de qualquer request usar o pipeline novo é a conta já ser `internalRole: admin`/`superadmin`.**

## 6. Confirmação — guest e usuários comuns permanecem no legado com allowlists vazias

Confirmado por leitura direta de `cv-processing-flag-resolver.service.ts#isEnabledFor` (única função de decisão, centralizada — nenhum outro lugar do código reimplementa essa lógica):

- **Guest** (`context.userId` ausente): só liga se `context.guestSessionHash` estiver presente **e** esse hash estiver na allowlist de guest. Allowlist vazia por padrão → `Set` vazio → `.has()` sempre `false` → **sempre legado**. Não existe curinga (`"*"` viraria literalmente o hash `"*"`, que nunca bate com um SHA-256 real).
- **Usuário comum** (`context.userId` presente, não admin): liga só se a flag global estiver `true` **ou** o `userId` estiver na allowlist de usuário. Com a flag `false` e a allowlist vazia → **sempre legado**.
- **Admin/superadmin**: sempre ligado, independente de qualquer allowlist — é o único caminho ativo por padrão pós-deploy.

## 7. Plano de rollback

| Estágio | Ação de rollback |
|---|---|
| **Antes do push** | Nada a reverter — a branch é só local. |
| **Depois do push, antes do merge** | Deletar a branch remota (`git push origin --delete feature/cv-canonical-profile-pipeline`) ou simplesmente não abrir/fechar o PR. `origin/main` nunca foi tocado. |
| **Depois do merge em `main`, antes do deploy** | `git revert` do commit de merge em `main` (ou reset se `main` ainda não foi pushado pra produção) — nenhuma migration foi aplicada ainda nesse ponto. |
| **Depois das migrations aplicadas, antes/depois do deploy do código** | **Reversão de código é segura sem reverter as migrations**: todas as 7 migrations são aditivas (tabelas/colunas novas, nullable, triggers que só disparam em `INSERT`/`UPDATE` novos). O código anterior (sem este branch) nunca lê essas tabelas/colunas novas — rodar a versão antiga da API contra o banco já migrado funciona normalmente, sem erro. Rollback = redeploy da imagem/commit anterior, sem tocar no banco. |
| **Se for necessário reverter o schema também** (caso extremo, não esperado) | Reverter as 7 migrations na ordem INVERSA da aplicação (`160000` → `220951`), cada uma com o `DROP`/`ALTER` correspondente ao que criou. Nenhuma dessas migrations apaga dado pré-existente, então uma reversão de schema também não perde dado histórico — só remove a capacidade estrutural nova. **Recomendação: não reverter schema a menos que uma migration prove causar um problema em produção que o rollback de código não resolva** — o cenário mais provável de rollback é só código, dado que o pipeline novo é opt-in. |
| **Se o problema for isolado a um usuário específico na allowlist** | Remover o `userId` da allowlist e redeployar só a variável de ambiente (sem rebuild) — reversão mais rápida que qualquer rollback de código. |

## 8. Comandos de deploy que seriam executados (não executados agora)

Seguindo a convenção já documentada do projeto (`docs/specs/2026-09-05-cv-canonical-profile-pipeline-deploy-escuro.md`, seção 1):

```bash
# 1. Merge da feature branch em main (revisão humana antes)
git checkout main
git merge --no-ff feature/cv-canonical-profile-pipeline
git push origin main   # <- ação remota real, só com autorização explícita

# 2. Railway já roda `prisma migrate deploy` antes de subir o processo
#    (apps/api/package.json#start → npm run deploy --workspace @earlycv/database && node dist/main.js)
#    Nenhum comando manual de migration é necessário além do deploy do código.

# 3. Variáveis de ambiente no Railway, configuradas ANTES do deploy do código
#    (ou no mesmo deploy, nunca depois):
CV_STRUCTURED_PROFILE_PIPELINE_ENABLED=false
CV_STRUCTURED_PROFILE_PIPELINE_ALLOWLIST_USER_IDS=
CV_STRUCTURED_PROFILE_PIPELINE_ALLOWLIST_GUEST_SESSION_HASHES=

# 4. Deploy do código (Railway detecta mudança em apps/api/** via
#    .railway-redeploy já tocado neste branch, dispara redeploy automático
#    no merge, ou trigger manual conforme o processo padrão do projeto).
```

Nenhum comando de backfill em nenhum ponto desta sequência.

## 9. Queries de invariantes pós-deploy

Rodar contra o banco de produção **só leitura** (nunca escrita manual), logo após o deploy e periodicamente durante o piloto:

```sql
-- 1. TalentProfile sem dono (deve ser 0 pra linhas NOVAS — as legadas
--    pré-existentes, ~187 hoje, continuam existindo e são esperadas)
SELECT count(*) FROM "TalentProfile"
WHERE "userId" IS NULL AND "talentSubjectId" IS NULL
  AND "createdAt" > <timestamp do deploy>;

-- 2. AnalysisJob succeeded sem CvStructuredProfile READY (pipeline novo)
SELECT count(*) FROM "AnalysisJob" a
LEFT JOIN "CvStructuredProfile" p ON p.id = a."cvStructuredProfileId"
WHERE a.status = 'succeeded' AND a."cvProcessingJobId" IS NOT NULL
  AND (p.id IS NULL OR p.status <> 'READY');

-- 3. Usuários com mais de um Resume.isMaster=true
SELECT "userId", count(*) FROM "Resume"
WHERE "isMaster" = true GROUP BY "userId" HAVING count(*) > 1;

-- 4. CvMasterDesignation ativa duplicada (usuário ou guest)
SELECT "userId", count(*) FROM "CvMasterDesignation"
WHERE "supersededAt" IS NULL AND "userId" IS NOT NULL
GROUP BY "userId" HAVING count(*) > 1;

SELECT "talentSubjectId", count(*) FROM "CvMasterDesignation"
WHERE "supersededAt" IS NULL AND "talentSubjectId" IS NOT NULL
GROUP BY "talentSubjectId" HAVING count(*) > 1;

-- 5. CvMasterDesignation ativa de USER sem resumeId (deveria ser
--    estruturalmente impossível — a trigger da migration 160000 já
--    protege; esta query é a segunda linha de defesa observável)
SELECT count(*) FROM "CvMasterDesignation"
WHERE "ownerType" = 'USER' AND "supersededAt" IS NULL AND "resumeId" IS NULL;

-- 6. CvMasterDesignation ativa órfã (resumeId aponta pra Resume que não
--    existe mais, ou que não é isMaster=true)
SELECT d.id FROM "CvMasterDesignation" d
LEFT JOIN "Resume" r ON r.id = d."resumeId"
WHERE d."ownerType" = 'USER' AND d."supersededAt" IS NULL
  AND (r.id IS NULL OR r."isMaster" IS NOT TRUE);
```

Todas devem retornar 0 linhas em todo momento pós-deploy.

## 10. Smoke tests pós-deploy, flag desligada (default)

Confirmar que o caminho legado está 100% intacto pra usuários comuns/guest:

1. Health check: `GET /api/health` → `200`.
2. Boot sem erro de DI nos logs (`grep -i "error\|UnknownDependencies\|Nest can't resolve"` vazio).
3. `prisma migrate status` no ambiente real → "Database schema is up to date!", nenhuma pendente.
4. Análise autenticada comum (usuário sem `internalRole` admin) via `POST /cv-adaptation/analyze` → completa normalmente, sem tocar `CvProcessingJob`/`CvSource` (confirmar contagem antes/depois igual).
5. Análise de guest via `POST /cv-adaptation/analyze-guest` → idem.
6. Upload de Master via `POST /resumes` → idem.
7. Claim (`POST /cv-adaptation/analysis-jobs/:jobId/claim`) → idem.
8. `set-primary` (`POST /resumes/:id/set-primary`) → troca `isMaster` normalmente, sem tocar `CvMasterDesignation`.
9. Contagem de `CvProcessingJob`/`AnalysisJob.cvProcessingJobId IS NOT NULL` antes e depois de exercitar 4-8 → delta zero.

## 11. Smoke tests para um único admin allowlisted

Depois do smoke da seção 10 confirmar zero impacto no legado:

1. Confirmar que a conta de teste tem `internalRole: admin` (ou está na allowlist de `userId`).
2. Upload de Master (arquivo) → `CvProcessingJob` criado, chega a `READY`, `CvMasterDesignation` criada com `resumeId` correto, `Resume.isMaster=true` exatamente nesse Resume.
3. Upload de Master (texto colado) → idem.
4. Análise usando o Master atual (`inputMode: "profile"`) → reusa a extração, sem nova chamada de IA.
5. Análise com CV diferente, sem promoção → `Master` original inalterado.
6. Análise com promoção explícita (`saveAsMaster: true`) → `Resume.isMaster` do Master anterior é desmarcado corretamente, nova designação criada, `UserProfile` sincronizado, `MonitorProjectionJob` criado.
7. Retry de uma falha simulada → não duplica extração nem análise.
8. Polling (`GET /cv-processing-jobs/:id` / `GET /cv-adaptation/analysis-jobs/:id`) → reflete o estado real, nunca finge `processing` enquanto só aguarda dependência.
9. Exclusão do Master → `CvMasterDesignation` supersedida corretamente (nunca fica órfã ativa — bloqueado estruturalmente pela migration `160000` caso o código esqueça de supersedir antes de apagar).
10. Rodar as 6 queries da seção 9 de novo, escopadas à conta de teste — todas em zero.

## 12. Dashboards/logs/queries para acompanhamento contínuo

**Queries operacionais** (rodar periodicamente, ex. a cada hora durante o piloto):

```sql
-- Distribuição de status dos jobs do pipeline novo
SELECT status, count(*) FROM "CvProcessingJob" GROUP BY status;
SELECT status, count(*) FROM "AnalysisJob" WHERE "cvProcessingJobId" IS NOT NULL GROUP BY status;

-- Jobs travados (PROCESSING há muito tempo — indicativo de stale não recuperado)
SELECT id, "claimedAt", "workerId" FROM "CvProcessingJob"
WHERE status = 'PROCESSING' AND "claimedAt" < now() - interval '10 minutes';

-- Possível duplicação: mais de um CvProcessingJob PENDING/PROCESSING pro
-- mesmo cvSourceId (pendência conhecida e documentada, não corrigida — ver
-- seção 13)
SELECT "cvSourceId", count(*) FROM "CvProcessingJob"
WHERE status IN ('PENDING','PROCESSING') GROUP BY "cvSourceId" HAVING count(*) > 1;

-- Divergência Resume x designação (mesma query da seção 9.5/9.6, rodar
-- continuamente, não só uma vez)
```

**Logs a monitorar (grep por padrão já existente no código, nenhum log novo foi criado além do que já é estruturado)**:
- `"cv processing job ... failed"` (`CvProcessingWorker`) — falha de extração/promoção, inclui `attempt N/3`.
- `"recovered from stale PROCESSING"` (`CvProcessingJobService`/`CvAnalysisWorker`) — recuperação de job travado, frequência anormal indica problema de infraestrutura (worker morrendo).
- `"talent_profile_capture_failed"` (`TalentProfileCaptureService`) — falha do caminho legado de captura de talento, sempre logada em nível `error`, nunca engolida silenciosamente.
- `"reusing legacy MasterCvCanonicalExtraction ... — no AI call"` — confirma que a migração just-in-time de Master legado está funcionando sem custo de IA extra.
- Qualquer log de erro contendo `max_tokens`/`max_completion_tokens` — não deveria mais aparecer após o commit `450aa41`; sua presença indicaria uma configuração de modelo OpenAI não coberta pelo padrão `o1|o3|o4|gpt-5*` do adapter.

## 13. Estimativa de impacto e risco

**Impacto no estado padrão pós-deploy (flag off, allowlists vazias)**: **zero** para guest e usuários comuns — todos os 15 commits foram desenhados e testados (295+ testes automatizados ao longo da feature, mais 3 smokes reais com IA de verdade) para preservar o caminho legado bit a bit quando não elegível. O único grupo afetado por padrão é `internalRole: admin`/`superadmin` — decisão deliberada do design, não um efeito colateral.

**Risco durante o piloto (após adicionar 1 admin à allowlist)**: baixo, escopado a uma única conta, reversível em segundos (remover da allowlist). Acompanhamento via seção 12 detecta qualquer divergência rapidamente.

**Riscos residuais conhecidos, não bloqueantes para o deploy escuro/piloto de 1 admin**:
- `resumes.service.ts#create()` (upload de Master) ainda não usa advisory lock ao disputar "virar o primeiro Master" — sob concorrência genuína de dois uploads simultâneos do MESMO usuário sem Master ainda, pode propagar um erro de índice único cru em vez de convergir graciosamente. Documentado desde a Fase 3C parte 1. Baixa probabilidade real (exigiria o mesmo usuário fazendo dois uploads simultâneos antes de ter qualquer Master).
- Endpoint de claim em lote (várias fontes de uma vez) não implementado — usuário reivindicando múltiplas análises precisa de uma chamada por análise.
- `.env.example` incompleto (seção 4) — corrigir antes do merge.
- Backfill das ~187 linhas legadas de `TalentProfile` sem dono permanece pendente — Fase 4, fora do escopo deste deploy, não bloqueante (a `CHECK ... NOT VALID` não afeta essas linhas).
- Teste legado pré-existente e não relacionado (`save-guest-preview without saveAsMaster does not create a primary master resume`) falha em `origin/main` HOJE, antes de qualquer commit desta feature (confirmado: o arquivo tem diff zero contra `origin/main`) — bug de negócio real, mas não introduzido nem agravado por este trabalho.

**Nenhum risco identificado envolve perda de dado, dois Masters simultâneos, ou análise sem extração formal** — as invariantes centrais do plano estão todas protegidas por trigger de banco, não só por teste de aplicação.

## 14. Confirmação — nenhuma migration executa backfill automaticamente

Confirmado por leitura das 7 migrations (seção 3): todas são `CREATE TABLE`/`ALTER TABLE ADD COLUMN`/`CREATE INDEX`/`CREATE TRIGGER`/`ALTER TYPE ADD VALUE`. Nenhuma contém `INSERT INTO ... SELECT`, `UPDATE ... SET` em massa, ou qualquer script de população de dado histórico. O backfill do plano (Fase 4, ~187 `TalentProfile` legados) é um script manual separado (`npm run <script> -- --dry-run`), nunca referenciado em `package.json#start`/`prestart`/`postinstall` nem em nenhum hook de boot — confirmado por busca nesses arquivos.

## 15. Confirmação — nenhum segredo ou dado de ambiente comprometido

- `git diff origin/main...feature/cv-canonical-profile-pipeline` inspecionado por padrão de chave (`sk-...`, `api_key=...`, blocos `BEGIN PRIVATE KEY`) — nenhum resultado.
- Único arquivo de ambiente tocado é `.env.example` (placeholders/defaults públicos: `false`, string vazia) — `.env` real nunca foi commitado nem alterado em nenhum commit.
- Todos os smokes reais com IA (DeepSeek e OpenAI) usaram scripts efêmeros fora do controle de versão, apagados ao final de cada sessão de verificação — nenhum script de smoke com chave real foi commitado.
- Todos os dados usados em testes automatizados e smokes são sintéticos (nomes/e-mails fictícios do tipo `exemplo@example.com`) — nenhum CV ou dado de usuário real foi usado em nenhum momento desta feature.

---

## Sequência operacional — pontos de GO/NO-GO

```
[1] ANTES DO PUSH
    GO se: build local limpo (typecheck+lint), suíte relevante passando,
           .env.example atualizado com a 3ª allowlist (seção 4),
           usuário autoriza explicitamente o push desta branch.
    NO-GO se: qualquer teste falhar na branch, ou autorização não dada.

    -> git push origin feature/cv-canonical-profile-pipeline

[2] ANTES DO MERGE em main
    GO se: PR revisado por humano, CI (se houver) verde, ninguém
           identificou regressão nova desde o push.
    NO-GO se: revisão pendente ou objeção não resolvida.

    -> merge feature/cv-canonical-profile-pipeline -> main

[3] DEPOIS DAS MIGRATIONS (aplicadas pelo próprio boot do Railway)
    GO se: `prisma migrate status` no ambiente real confirma as 7
           migrations aplicadas, nenhuma pendente, nenhum erro no log
           de deploy relacionado a schema.
    NO-GO se: qualquer migration falhar — nesse caso, NENHUM deploy de
              código deveria ter subido ainda (Railway roda migrate
              deploy antes do boot do processo); investigar e corrigir
              antes de tentar de novo.

[4] DEPOIS DO DEPLOY ESCURO (flag off, allowlists vazias)
    GO se: os 9 itens do smoke da seção 10 passam, as 6 queries da
           seção 9 retornam zero, nenhum log de erro novo relacionado
           ao pipeline aparece nas primeiras horas.
    NO-GO se: qualquer smoke falhar, ou qualquer invariante não for
              zero — nesse caso, rollback de código (seção 7), sem
              precisar reverter schema.

[5] ANTES DE ADICIONAR O ADMIN À ALLOWLIST
    GO se: o item [4] está confirmado estável por um período de
           observação (recomendado: pelo menos algumas horas, sem
           necessidade de decidir o número exato agora), e o usuário
           autoriza explicitamente a inclusão da conta de teste.
    NO-GO se: qualquer sinal de instabilidade no deploy escuro, ou
              autorização não dada.

[6] DEPOIS DO PILOTO (1 admin)
    GO para ampliar se: os 10 itens do smoke da seção 11 passam, as
           métricas da seção 12 não mostram divergência/duplicação/
           stale anormal durante o período de piloto, e o usuário
           revisa e aprova os resultados.
    NO-GO se: qualquer achado real (mesmo pequeno) aparecer — parar,
              corrigir, repetir o piloto antes de prosseguir.

[7] ANTES DE QUALQUER AMPLIAÇÃO (mais usuários na allowlist, ou
    ligar a flag global, ou iniciar o backfill da Fase 4)
    GO somente com autorização explícita e nova do usuário, após
        revisão dos resultados do piloto — cada ampliação é uma
        decisão própria, não uma continuação automática desta.
    NO-GO por padrão até essa autorização existir.
```

**Nenhuma ação dos passos [1]–[7] foi executada.** Este documento é só o relatório solicitado, aguardando autorização para o passo [1].
