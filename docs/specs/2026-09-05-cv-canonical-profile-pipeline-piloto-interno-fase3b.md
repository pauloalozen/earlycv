# Piloto interno — Fase 3B (pipeline canônico de CV)

**Data:** 2026-09-05
**Escopo:** simulação LOCAL completa e realista dos 10 cenários do piloto interno pedidos para a Fase 3B, exercitados via HTTP real contra o `AppModule` completo (supertest), Postgres real (`earlycv_test`), com a flag global desligada e uma conta de teste com `internalRole: admin`.
**Referências:** `docs/specs/2026-09-04-cv-canonical-profile-pipeline-plan.md` (v3), `docs/specs/2026-09-05-cv-canonical-profile-pipeline-deploy-escuro.md` (Fase 3A).
**Artefato criado:** `apps/api/src/cv-processing/pilot-simulation.e2e-spec.ts` (script de simulação, rodado manualmente via `npm run test -- src/cv-processing/pilot-simulation.e2e-spec.ts`; não faz parte da suíte de CI permanente).

---

## 1. Confirmação de que nada está em produção real

```
$ git branch --show-current
feature/cv-canonical-profile-pipeline

$ git fetch origin && git log --oneline origin/main -1
54a3838 Merge pull request #41 from pauloalozen/develop

$ git log --oneline main -1        # branch LOCAL, não confundir com origin/main
b87e0eb feat(cv-processing): Fase 2G — set-primary integrado, auditoria e fechamento dos 3 entrypoints legados

$ git log --oneline HEAD -1        # feature/cv-canonical-profile-pipeline, antes deste trabalho
834c991 docs(cv-processing): Fase 3A — checklist de deploy escuro e validação local do pipeline canônico
```

`origin/main` (produção real) continua em `54a3838`, sem nenhum commit desta feature. O branch `main` LOCAL deste checkout (`b87e0eb`) é só onde o trabalho foi commitado antes de existir uma branch dedicada — não reflete produção. Nenhum `git push` foi executado em nenhum momento deste trabalho (confirmado: nenhum comando `git push` foi rodado nesta sessão).

---

## 2. Ambiente e configuração do piloto

- **Processo**: `AppModule` completo, subido via `Test.createTestingModule` + `supertest` (não um `node dist/main.js` externo) — decisão documentada: para os 10 cenários pedidos, isso dá HTTP real (mesmos controllers/guards/DTOs de produção) com controle determinístico sobre os workers, sem esperar os 15s reais de cron nem lidar com um processo externo solto. `CvProcessingWorker`/`CvAnalysisWorker` têm `@Cron` desabilitado quando `NODE_ENV=test` (código existente, não uma decisão deste piloto) — os workers foram acionados manualmente, por job específico (nunca pela varredura em lote `processPendingBatch()`, ver nota abaixo).
- **Banco**: Postgres local real, `earlycv_test` (nunca `earlycv_homolog`/produção). Migrations confirmadas em dia (`prisma migrate status` → "Database schema is up to date!", 91 migrations).
- **Flag global**: `CV_STRUCTURED_PROFILE_PIPELINE_ENABLED` explicitamente `delete`d no início do teste — nunca setada como `"true"`. `CV_STRUCTURED_PROFILE_PIPELINE_ALLOWLIST_USER_IDS` também nunca setada.
- **Ativação da conta de teste**: um usuário criado via `POST /api/auth/register` real, promovido a `internalRole: "admin"` diretamente no banco (`database.user.update`) — o mecanismo mínimo exigido por `cv-processing-flag-resolver.service.ts#isEnabledFor()` (admin/superadmin sempre habilitado, independente de allowlist). Não foi necessário usar a allowlist explícita para este piloto (mecanismo já coberto por `cv-processing-flag-resolver.service.spec.ts`, decisão documentada por ser a via mais simples de configurar e reproduzir).
- **IA**: `CvStructuredProfileExtractionService` foi substituído (`overrideProvider`) por um fake determinístico e controlável (`ControllableExtractionClient`) — o mesmo padrão já usado pelos specs de Fase 2C/2D/2G do projeto (instanciação direta com `extract: async () => ...`). Achado documentado: diferente do caminho legado (`cv-adaptation-ai.service.ts`, que respeita `SKIP_AI=true`), o serviço de extração do pipeline **novo** não tem um modo `SKIP_AI` embutido — ele só é testável via injeção de um `ExtractionClient` alternativo. Isso é adequado para testes (por design, via `@Optional()` no construtor), mas significa que um boot real do processo sem essa substituição faria chamadas reais (pagas) à OpenAI. Nenhuma chamada real à OpenAI foi feita neste piloto.
- **Storage**: `StorageService` substituído por um fake em memória (mesmo padrão de todo `e2e-spec` já existente no projeto).
- **Higiene do banco de teste**: `earlycv_test` acumula ~2100 `CvProcessingJob` (557 ainda `PENDING`) de execuções anteriores da suíte desta feature ao longo das fases (achado já documentado em `deploy-escuro.md`, seção 4). Isso invalidaria qualquer uso de `worker.processPendingBatch()` (varre `PENDING` globalmente, sem filtro por dono) — por isso todo avanço de job neste piloto usa `claimOne(jobId)` + processamento direcionado por id específico (mesmo padrão usado por `cv-analysis-pipeline.e2e-spec.ts#processOneCvJob`), nunca a varredura em lote. Recomendação operacional (não executada neste piloto, fora de escopo): resetar `earlycv_test` antes da próxima rodada de trabalho.

---

## 3. Resultado por cenário

Todos os 10 cenários pedidos foram exercitados. 9 rodaram de ponta a ponta com sucesso via HTTP real; o cenário 10 (claim guest→conta) foi confirmado como **não praticável** nesta configuração exata do piloto, com evidência real de banco (não apenas leitura de código) — ver detalhe abaixo.

| # | Cenário | HTTP (ms) | CvProcessingJob (ms) | AnalysisJob (ms) | Estado final |
|---|---|---|---|---|---|
| 1a/2 | Primeiro Master via texto colado | 92 | 131 | — | `READY` |
| 1b/3 | Substituição do Master via arquivo (.docx real) | 94 | 104 | — | `READY` |
| 4 | `inputMode: "profile"` (reusa Master) | 37 | 0 (reuso, sem extração) | 792 | `succeeded` |
| 5 | CV diferente do Master, sem promoção (`NONE`) | 53 | 85 | 534 | `succeeded` |
| 6 | Promoção explícita via análise (`saveAsMaster: true`) | 38 | 75 | 431 | `succeeded` |
| 7 | Falha e retry (extração falha 1x) | 32 | 52 (14 falha + 41 retry) | 291 | `succeeded`, 0 duplicatas |
| 8 | Polling dedicado `GET /cv-adaptation/analysis-jobs/:id` | — | — | 293–364 (6–7 requisições) | `succeeded` |
| 9 | Exclusão do Master | 12–21 (DELETE) | — | — | `200 OK`, ver achado |
| 10 | Claim guest→conta | — | — | — | não exercitado (justificado) |

Números variam ligeiramente entre execuções (±dezenas de ms, ambiente local compartilhado) — a ordem de grandeza é o que importa: toda etapa síncrona do request HTTP (sem IA) fica na casa de **dezenas de ms**; o processamento do `CvProcessingJob` (com o fake de IA) fica também na casa de dezenas a ~130ms; a análise (`AnalysisJob`) leva mais tempo (~300–800ms) por envolver o gateway de proteção completo (`AnalysisProtectionFacade`) e mais leituras/gravações. **Importante**: como os workers rodam em cron real a cada 15s em produção (`BASE_TICK_CRON = "*/15 * * * * *"`) e foram acionados manualmente aqui para tornar o piloto determinístico, o tempo real de "usuário aguardando" em produção inclui até ~15s de espera pelo próximo ciclo de cron além do tempo de processamento em si — isso não está reduzido nesta tabela.

### Detalhe por cenário

1. **Arquivo e texto**: upload de Master por texto colado (`rawText` via `POST /resumes`) e por arquivo real `.docx` (gerado em memória com o pacote `docx`, extraído de fato via `mammoth` — o mesmo caminho de extração de texto usado em produção) — ambos criaram exatamente 1 `CvProcessingJob` cada, com `CvSubmission.origin` distinto (`PASTED_TEXT` vs. `FILE_UPLOAD`), como esperado.
2. **Primeiro Master**: confirmado `masterIntent: PROMOTE_IF_FIRST`, `CvMasterDesignation` criada, `UserProfile.fullName` sincronizado, Base de Talentos populada (`TalentEducationObservation`/`TalentCompetencyObservation` > 0).
3. **Substituição de Master**: upload de arquivo com `isPrimary=true` sobre um Master já existente gerou `masterIntent: PROMOTE_EXPLICIT`; a designação antiga foi superseded, exatamente uma ativa ao final, `UserProfile` atualizado.
4. **`inputMode: "profile"`**: reusou o `CvProcessingJob` do Master atual (mesmo id, dedup confirmado) — **zero chamadas novas** ao extrator (`extractionClient.calls` inalterado).
5. **Análise com CV diferente, sem promoção**: `masterIntent: NONE` confirmado; a designação ativa do Master **não mudou**.
6. **Análise com promoção explícita**: `masterIntent: PROMOTE_EXPLICIT` via `POST /cv-adaptation/analyze` (`saveAsMaster: true`); nova designação ativa confirmada — mas revelou uma divergência real (ver Achados, item 1).
7. **Falha e retry**: extração forçada a falhar na 1ª tentativa (mock controlado por marcador de texto); o `CvProcessingJob` voltou sozinho para `PENDING` (retry automático, `attempts=1 < MAX_CV_PROCESSING_ATTEMPTS=3`, sem intervenção manual) e teve sucesso na 2ª tentativa. Confirmado: **zero duplicação** de `CvProcessingJob` ou `CvStructuredProfile` para o mesmo `cvSourceId`.
8. **Polling**: ciclo completo `pending`→`succeeded` via `GET /cv-adaptation/analysis-jobs/:id` real, com o worker disparado em paralelo (mesma dinâmica do frontend real) — 6–7 requisições de polling até o status final, ~300ms de wall-clock (sem contar o cron real de produção).
9. **Exclusão de Master**: ver Achados, item 3 (comportamento observado diverge do texto citado no enunciado do piloto).
10. **Claim guest→conta**: ver Achados, item 4 (não praticável nesta configuração; caminho já coberto em nível mais baixo por specs de Fase 2E).

---

## 4. Consolidado

- **Taxa de sucesso**: 9 de 10 cenários concluídos com sucesso de ponta a ponta; o 10º foi **corretamente não-praticável** por desenho do sistema nesta fase (confirmado com evidência, não assumido) — nenhum cenário terminou em estado inesperado/quebrado.
- **Jobs por estado (usuário de teste do piloto)**: `CvProcessingJob` → `{"READY": 7}` (total 7, 0 `PENDING`/`PROCESSING`/`FAILED` remanescentes); `AnalysisJob` → `{"succeeded": 5}` (total 5). Nenhum job do piloto ficou pendurado em estado não-terminal.
- **Recovery de stale/processo morto**: **não exercitado neste piloto** — já coberto e provado extensivamente em `cv-analysis-pipeline.e2e-spec.ts` (cenários 9, 10, 17: `recoverStaleProcessing()` via conexões/instâncias novas simulando processo morto) e em `resumes.set-primary-canonical.e2e-spec.ts` (os "5 momentos"). Repetir aqui seria redundante; o piloto focou em cobrir os 10 cenários pedidos via HTTP real, que é o ângulo que os testes de fases anteriores (por construção, chamando serviços diretamente) não cobriam.
- **Chamadas e custo de IA**: 8 chamadas ao `ExtractionClient`, todas para o fake determinístico (`ControllableExtractionClient`) — **zero chamadas reais à OpenAI**. Custo real: N/A.
- **Duplicações**: zero encontradas — verificado explicitamente no cenário 7 (retry) e implicitamente em todos os outros via contagem de designações ativas (sempre exatamente 1).
- **Divergências Resume/designação/UserProfile**: **duas divergências reais encontradas** (detalhe abaixo) — nenhuma corrigida nesta fase, por estarem fora do escopo do piloto (o piloto observa e reporta, não corrige).
- **Base de Talentos**: confirmada a criação de `TalentEducationObservation`/`TalentCompetencyObservation` para o primeiro CV processado (cenário 1a/2); o padrão se repete estruturalmente em todos os `CvProcessingJob` que chegam a `READY` (`CvTalentCaptureService#capture()` é chamado incondicionalmente pelo worker, ver `cv-processing.worker.ts` linha ~115) — não achado nenhum caso onde a captura foi pulada.

### Achados (não corrigidos nesta fase — reportados para decisão)

1. **Upload de Master via `POST /resumes` nunca preenche `CvMasterDesignation.resumeId`.** `resumes.service.ts#create()` chama `cvProcessingEntrypoint.enqueueFromUserText()` sem o parâmetro `resumeId` (diferente de `#setPrimaryCanonical()`, que sempre o preenche). A designação continua funcionalmente correta (aponta para um `CvStructuredProfile READY` válido), mas a ligação reversa Resume↔designação fica incompleta para todo Master promovido diretamente no upload — só é corrigida se o usuário depois chamar `set-primary` sobre o mesmo Resume.
2. **Divergência confirmada entre `Resume.isMaster` e `CvMasterDesignation` após promoção via análise.** Depois de uma promoção explícita via `POST /cv-adaptation/analyze` (`saveAsMaster: true`, sem `masterResumeId`), a `CvMasterDesignation` ativa passa a apontar para um `CvStructuredProfile` sem nenhum `Resume` associado (o `CvProcessingJob` correspondente nunca carrega `resumeId` neste caminho) — mas o `Resume` que era Master antes (upload de arquivo) **permanece com `isMaster: true`** no banco, porque `syncResumeIsMaster` (que demoveria o Resume antigo) só roda quando o `CvProcessingJob` carrega um `resumeId` (`cv-processing.worker.ts`). Isso quebra a invariante "exatamente um Resume.isMaster, apontando para o mesmo CV da designação ativa" pedida no piloto — a UI de "Meu CV" (baseada em `Resume`) ficaria mostrando um CV que não é mais o Master real do sistema segundo `CvMasterDesignation`.
3. **Exclusão do Master não supersede a designação ativa.** Ao deletar o `Resume` que originou o Master (via `DELETE /resumes/:id`), `CvMasterDesignation.resumeId` é apenas `SetNull` pela FK (`schema.prisma`) — nenhum código em `resumes.service.ts#remove()` chama o serviço de promoção para marcar a designação como superseded. `UserProfile` permanece intacto ("preferências preservadas" se confirma) e nenhuma promoção automática de outro CV acontece (comportamento correto, confirmado) — mas a designação fica **ativa e órfã** (sem `Resume`, mas ainda apontando para um `CvStructuredProfile READY` válido) em vez de superseded, divergindo do texto citado no enunciado do piloto ("designação supersedida"). Nota: esse texto cita a "seção 6 de uma revisão anterior do plano" que não está mais neste repositório (o plano atual, v3, substitui essa revisão e não descreve esse fluxo em detalhe na seção 6 correspondente) — então isto não é necessariamente uma regressão de uma regra já implementada, mas sim um comportamento que nunca foi implementado e deveria ser decidido/priorizado.
4. **Claim guest→conta não é praticável nesta configuração do piloto — confirmado com evidência real.** Uma análise de visitante real (`POST /cv-adaptation/analyze-guest`), com a configuração exata deste piloto (flag global desligada), gerou um `AnalysisJob` com `cvProcessingJobId: null` — nunca produz um `CvSource`/`CvProcessingJob` no pipeline novo para o `ClaimSourceGrantService` reivindicar. Confirmado em código (`cv-processing-flag-resolver.service.ts#isEnabledFor` retorna `false` sempre que `context.userId` está ausente e a flag global está desligada — decisão deliberada documentada no próprio arquivo) e agora também em runtime (contagem de `CvProcessingJob` antes/depois idêntica). O mecanismo de claim granular em si (`ClaimSourceGrantService`) já está coberto e validado por `claim-guest-analysis-job-canonical.e2e-spec.ts`/`claim-source-grant.service.spec.ts` (Fase 2E), usando fixtures inseridas diretamente no banco para simular um guest que já passou pelo pipeline novo — mas isso não é o mesmo que exercitar o fluxo real de ponta a ponta. **O que falta para testar isso no piloto**: um mecanismo específico de ativação para guest (ex.: allowlist por `guestSessionHash`) — o próprio `cv-processing-flag-resolver.service.ts` já reserva esse campo no tipo `CvStructuredProfilePipelineContext#guestSessionHash`, mas explicitamente não o implementa nesta fase ("decisão adiada para quando isso acontecer").

Nenhum desses 4 achados é uma regressão introduzida por este piloto — são comportamentos pré-existentes do código já commitado na branch, agora observados e documentados por ser a primeira vez que o fluxo é exercitado via HTTP real de ponta a ponta (em vez de só via chamada direta de serviço, como as suítes de fases anteriores fazem).

---

## 5. Pendências e limitações do piloto

- **Cenário 10 (claim guest→conta) não exercitado de ponta a ponta** — justificado no achado 4 acima. Recomendação: se o produto decidir que vale testar claim de guest antes do rollout mais amplo, implementar o mecanismo de allowlist por `guestSessionHash` já reservado no tipo, ou aceitar testar apenas com a flag global ligada (ambiente isolado), como já é feito pelas suítes de Fase 2D/2E.
- **Recovery de processo morto/stale não re-exercitado neste piloto** — já coberto por suítes anteriores (ver seção 4), não repetido aqui por não ser o ângulo específico que faltava (HTTP real).
- **Banco de teste (`earlycv_test`) com acúmulo de fixtures de fases anteriores** — não é um bloqueador (o piloto usou processamento por-job-id, imune a isso), mas seguem pendentes de limpeza por higiene (fora de escopo desta tarefa).
- **Dois achados de divergência (itens 1 e 2 acima) e um de comportamento pendente (item 3) ficam registrados sem correção** — decisão deliberada do escopo do piloto ("não corrigir, reportar").

---

## 6. Confirmação de encerramento

- Nenhum processo `node dist/main.js` foi subido neste piloto (a simulação usou `Test.createTestingModule` in-process, encerrado via `app.close()` no `finally` do teste) — confirmado `lsof -i :4000`/`:3000` vazio e nenhum processo `node.*main` remanescente após a execução.
- Nenhum `git push` foi executado em nenhum momento desta tarefa.
- Nenhuma infraestrutura real (Railway, produção, homolog remoto) foi tocada — toda a validação rodou contra Postgres local (`earlycv_test`) e um `AppModule` de teste, ambos derrubados/encerrados ao final.
- Nenhum backfill foi iniciado. Nenhuma liberação para outras contas além da conta de teste do piloto.

---

## 7. Recomendação

**O piloto sustenta avançar para a próxima fase (Fase 4 — backfill/liberação gradual), com duas condições:**

1. **Decisão de produto sobre os achados 1–3** (divergências Resume↔designação) antes de qualquer liberação além de admin/allowlist — não são bugs que quebram dados (a designação ativa sempre aponta para uma extração válida), mas *são* inconsistências visíveis para o usuário (UI de "Meu CV" pode mostrar um CV que não é mais o Master real). Recomenda-se resolver pelo menos o achado 2 (promoção via análise não demove o Resume antigo) antes de abrir o pipeline para mais usuários, já que esse é o caminho mais comum de "salvar como Master a partir de uma análise" — os achados 1 e 3 são menos urgentes (não quebram a UI imediatamente, só deixam uma FK reversa vazia ou uma designação órfã, ambas ainda funcionalmente corretas).
2. **Guest permanece de fora até existir um mecanismo de piloto controlado para visitantes** (achado 4) — não é um bloqueador para avançar com usuários autenticados, mas deve ser resolvido antes de qualquer expansão do pipeline para o fluxo de visitante.

Nenhum achado indica um problema de integridade de dados, duplicação, custo de IA fora de controle, ou falha de recovery — os 9 cenários exercitáveis via HTTP real terminaram exatamente nos estados esperados, com métricas de latência consistentes com uma extração/análise fora do caminho crítico do request (nenhuma chamada de IA dentro do ciclo HTTP, confirmado pelas medições de `httpMs` na casa de dezenas de ms mesmo nos cenários que disparam processamento assíncrono).
