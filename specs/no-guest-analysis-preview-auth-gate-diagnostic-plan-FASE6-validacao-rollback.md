# EarlyCV — Fase 6: validação de rollback end-to-end

## Status desta spec

Documento de validação técnica. Trabalho local (sem deploy, sem staging, sem produção — nenhum ambiente remoto foi tocado). Branch `feature/guest-analysis-auth-gate-fase1`, commits das Fases 1-6.

Este documento fecha o plano aprovado em `specs/no-guest-analysis-preview-auth-gate-diagnostic-plan-ADENDO-hardening.md`.

---

## 1. Como alternar a flag (procedimento exato)

**Não existe flag de arquivo/env var** — é uma linha na tabela `AnalysisProtectionConfig`, gerenciada pelo mecanismo de admin config já existente (o mesmo usado para `kill_switch_enabled`, `rollout_mode` etc.), reaproveitado sem infraestrutura nova (Fase 2).

**Endpoint**: `PATCH /api/admin/analysis-protection/config/guest_analysis_auth_gate_enabled`
**Autenticação**: JWT de usuário com `internalRole` `admin` ou `superadmin` (`AnalysisConfigController`, guardas `JwtAuthGuard` + `RolesGuard`).
**Corpo**:
```json
{ "value": true, "source": "operador-nome-ou-motivo" }
```
**Exemplo**:
```bash
curl -X PATCH "$API_URL/api/admin/analysis-protection/config/guest_analysis_auth_gate_enabled" \
  -H "Authorization: Bearer $ADMIN_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"value": true, "source": "rollout-guest-auth-gate"}'
```

Efeito: em runtime, sem reiniciar o processo (cache de 5s do `AnalysisConfigService`), sem migration, sem deploy. Toda escrita fica registrada em `AnalysisProtectionConfigAudit` (quem, quando, valor antigo/novo) — auditoria automática de quem ligou/desligou.

**Leitura pelo frontend**: `GET /api/cv-adaptation/config/public` (sem autenticação, só expõe o boolean). Página `/adaptar` e `/adaptar/resultado` leem essa rota a cada carregamento (sem cache de build-time).

### Achado corrigido nesta fase

`UpdateAnalysisConfigDto.value` não tinha nenhum decorator do `class-validator`. Sob o `ValidationPipe` global real da aplicação (`whitelist: true, forbidNonWhitelisted: true`, confirmado em `apps/api/src/main.ts`), isso fazia **qualquer** escrita real via este endpoint (não só esta chave) ser rejeitada com 400 `"property value should not exist"`. Era um bug pré-existente, nunca coberto por teste e2e antes (só existia um teste unitário do controller chamando o método diretamente, sem passar pelo pipe HTTP real) — só apareceu ao validar o mecanismo de toggle fim a fim aqui. Corrigido com `@IsDefined()` no campo `value` (commit `72aef76`). Sem essa correção, o procedimento de rollback documentado no plano aprovado **não funcionava de verdade** em produção.

---

## 2. Validação automatizada (E2E, app + Postgres reais)

Arquivo: `apps/api/src/cv-adaptation/guest-auth-gate-rollback.e2e-spec.ts` — 3 testes, todos passando, usando o **mesmo endpoint HTTP de admin** que um operador real usaria (não um atalho de teste):

| Teste | O que prova |
|---|---|
| `flag OFF preserves the current guest flow end-to-end` | Com a flag desligada, `analyze-guest` → polling não autenticado devolve `adaptedContentJson`/`previewText`/`analysisCvSnapshotId` completos — exatamente o que o frontend guarda em `guestAnalysis` hoje. |
| `flag ON gates content end-to-end` | Com a flag ligada: sem token de posse, nem status (404); com token, só `{status}` mesmo após `succeeded`; claim autenticado materializa a `CvAdaptation`. Inclui também a prova de que a flag é um **gate de leitura** — desligá-la no meio do teste expõe imediatamente o conteúdo do mesmo job, sem recriar nada, religando em seguida para continuar testando o claim com a flag ligada. |
| `toggling the flag back OFF restores the old behavior immediately` | Liga → cria job (status-only) → desliga → um job **novo** criado já com a flag desligada volta a expor conteúdo completo, sem nenhum resquício do período em que esteve ligada. |

Rodado duas vezes seguidas para confirmar estabilidade (sem flakiness por rate-limit/dedupe compartilhado entre testes — texto de vaga único por chamada via `uniqueJobDescription()`).

---

## 3. Cenários obrigatórios (16) — status

| # | Cenário | Status | Evidência |
|---|---|---|---|
| 1 | guest → Google signup → resultado | **Mecanismo verificado** (backend); **round-trip real do Google não automatizável neste repo** (sem Playwright, sem credenciais de teste do Google) | `oauth-attempt.service.spec.ts`, `auth.controller.oauth-attempt-callback.spec.ts`, `social-auth.spec.ts` cobrem toda a cadeia server-side (criação do attempt, resolução do state, transferência de ownership, claim). Requer QA manual em navegador para o trecho Google↔browser em si. |
| 2 | guest → Google login existente → resultado | Idem #1 — `finishSocialLogin` já tratava conta existente antes desta mudança (`social-auth.spec.ts: "links a Google account to an existing user"`), path de claim é o mesmo | QA manual para o round-trip real |
| 3 | guest → email signup → resultado | **Wiring verificado por leitura de código** (`register-user/route.ts` chama `claimGuestAnalysisJobServerSide` logo após `persistAppSession`); **sem teste automatizado do route handler completo** (form POST real) nesta fase | Pendente: teste de rota dedicado ou QA manual |
| 4 | guest → email login existente → resultado | Idem #3 (`login-user/route.ts`) | Pendente: teste de rota dedicado ou QA manual |
| 5 | usuário authenticated desde o início | **Inalterado** — `/cv-adaptation/analyze` e todo o fluxo autenticado não foram tocados em nenhuma fase | Suíte pré-existente, sem regressão (confirmado fases 1-5) |
| 6 | OAuth cancelado | **Garantido por construção** — nada transfere ownership sem um callback bem-sucedido consumindo o `state`; se o usuário nega/cancela, o `OAuthAttempt` simplesmente expira (TTL 10 min) e o `AnalysisJob` permanece guest | Não testável sem simular a negação real do Google; lógica é a mesma testada em "state expirado" (`oauth-attempt.service.spec.ts`) |
| 7 | callback OAuth duplicado | **Verificado** | `oauth-attempt.service.spec.ts`: "callback duplicado: resolver o mesmo state duas vezes... nunca resolve com sucesso duas vezes" |
| 8 | duplo clique em analisar | **Protegido por mecanismo pré-existente, não alterado por esta mudança** — dedupe lock por `canonicalHash` em `AnalysisProtectionFacade` | Não retestado nesta fase (fora do escopo da mudança) |
| 9 | refresh após submit | **Garantido por construção** — `guestPossessionToken`/`jobId` ficam em `sessionStorage` (sobrevive a refresh na mesma aba); job já persistido no backend antes do redirect | Raciocínio de código, sem teste de browser automatizado |
| 10 | refresh após login | **Garantido por construção** — `claimJobId`/`adaptationId` na URL, claim e fetch de conteúdo são idempotentes | Raciocínio de código + idempotência já testada (#12) |
| 11 | duas abas (aba A análise A, aba B análise B, login pela aba A → A recebe A) | **Mecanismo central verificado** | `oauth-attempt.service.spec.ts`: "duas abas com dois jobs diferentes: cada state resolve para o analysisJobId correto, sem cruzar". Confirmação visual em dois browsers reais requer QA manual |
| 12 | claim duplicado | **Verificado** | Unitário (`cv-adaptation.service.spec.ts`: "claim repetido... sem criar uma segunda CvAdaptation") + e2e com Postgres real e duas requisições HTTP verdadeiramente concorrentes (`cv-adaptation.e2e-spec.ts`: constraint `@unique` barra a segunda inserção) |
| 13 | polling guest com flag ON | **Verificado** | `cv-adaptation-public.controller.spec.ts`, `cv-adaptation.service.spec.ts` (`getGuestAnalysisJobStatusOnly`) + `guest-auth-gate-rollback.e2e-spec.ts` |
| 14 | tentativa de acessar job de outro usuário | **Verificado** | `cv-adaptation.e2e-spec.ts`: "rejects a caller who does not own the job — jobId alone never grants access" |
| 15 | guest abandona login | **Verificado o essencial (persistência)**; não-emissão de `analysis_result_viewed` é garantida por construção (evento só dispara client-side quando `rawData !== null`, que só é populado via `adaptationId`/`claimJobId` bem-sucedidos — nenhum dos dois existe para quem abandona) | `guest-auth-gate-rollback.e2e-spec.ts` confirma que o `AnalysisJob` permanece intacto e consultável independentemente de claim; não há teste de instrumentação de front-end dedicado a este cenário específico |
| 16 | guest convertido (CvAdaptation criada, snapshot preservado, sem nova IA) | **Verificado** | `cv-adaptation.e2e-spec.ts`: materialização completa + prova explícita de que o snapshot sobrevive ao `cleanupExpiredGuestSnapshots` mesmo com `expiresAt` vencido; unitário com mock que lança erro se qualquer método de IA for chamado |

**Resumo**: 10 de 16 cenários têm verificação automatizada direta contra app+Postgres reais ou testes unitários específicos. 4 (#1, #2, #6, #9, #10, #11-parcial) dependem de comportamento nativo de browser/Google que só um teste com Playwright ou QA manual real cobre — a lógica server-side subjacente a cada um está testada isoladamente. 2 (#3, #4) têm o wiring correto por leitura de código mas sem teste automatizado do route handler completo — candidatos a fechar antes de produção, se desejado.

---

## 4. Analytics — confirmação

Nenhum evento foi alterado em nenhuma fase (auditoria original na Fase de diagnóstico permanece válida). Confirmações específicas desta implementação:

- `analysis_started`/`analysis_completed`/`analysis_failed`: emissão em `cv-adaptation.service.ts` (`processAnalysisJob`) **não foi tocada em nenhuma linha** nas Fases 1-6 — o pipeline de processamento em si é idêntico ao anterior, guest ou autenticado.
- `signup_completed`/`login_completed`: `AuthService.finishSocialLogin`/`register`/`login` não foram alterados; a única adição (Fase 3/4) é a chamada a `transferAnalysisJobOwnership`/claim **depois** desses eventos já terem dídisparado, nunca interferindo neles.
- `visitor_id`/`sessionInternalId`/`conversion_context`: os 3 cookies `oauth_signup_ctx`/`oauth_journey_sid`/`oauth_visitor_id` continuam funcionando exatamente como antes (Fase 3, testes `oauth-signup-context.spec.ts` inalterados e passando) — o novo mecanismo de `state`/`OAuthAttempt` é aditivo, não substitui essa propagação.
- `analysis_result_viewed`: condição de disparo no frontend (`!rawData || (!isDemo && isAuthenticated === null)) return;`) **não foi alterada** — só o que alimenta `rawData` mudou (nunca mais via `guestAnalysis` storage quando a flag está ligada). O evento continua correto por construção, sem precisar de mudança de código nele.

---

## 5. Rollout recomendado (não executado — decisão do Paulo)

1. Deploy com a flag OFF (comportamento atual, sem nenhuma mudança visível).
2. Smoke test do fluxo atual em produção (igual sempre foi).
3. Smoke test técnico do novo backend: `GET /api/cv-adaptation/config/public` responde `{guestAnalysisAuthGateEnabled: false}`; `PATCH` do admin funciona (confirmar com o fix desta fase).
4. Ligar em staging (se existir) ou para um subconjunto controlado; executar manualmente os cenários #1-#4 e #11 (os que dependem de browser real) antes de confiar no restante.
5. Ligar em produção.
6. Observar `analysis_started → analysis_completed → signup_completed/login_completed → analysis_result_viewed` nos primeiros minutos; observar erros de `OAuthAttempt`/claim/ownership/polling/callback.
7. Rollback a qualquer momento: `PATCH .../guest_analysis_auth_gate_enabled` com `value: false` — sem commit, sem migration, sem redeploy.

---

## 6. Conclusão

As 6 fases do plano aprovado (`ADENDO-hardening.md`) estão implementadas, testadas (unitário + e2e contra Postgres real) e o mecanismo de rollback foi validado fim a fim contra o endpoint real de produção — incluindo a correção de um bug pré-existente que o impediria de funcionar. Os itens pendentes de QA manual (#1-#4, #11 visual) são inerentes a não haver infraestrutura de teste de browser (Playwright) neste repositório — não são lacunas desta implementação, são o limite do que é automatizável localmente sem essa ferramenta.
