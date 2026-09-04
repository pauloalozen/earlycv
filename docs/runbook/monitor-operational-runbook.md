# Meu Monitor — Runbook Operacional

Data: 2026-08-27
Escopo: backend (`apps/api/src/monitor`, `apps/api/src/admin-monitor`), frontend usuário (`apps/web/src/app/monitor`), frontend admin (`apps/web/src/app/admin/monitor`), e-mail (`apps/api/src/email`).

## 1) O que é a feature

"Meu Monitor" é um feed de recomendações de vaga personalizado e persistido — diferente do Radar (busca/exploração), o Monitor nunca lista vagas sob demanda: um worker em background casa `UserRadarProfile` contra vagas novas (matching por vaga) e contra a base existente (backfill/rematch), grava `UserJobRecommendation` só para nível de aderência ≥3, e opcionalmente avisa por e-mail (digest diário/semanal).

Fluxo ponta a ponta:

```
UserRadarProfile (perfil de matching, o mesmo do Radar)
  → MonitorMatchJob (1 por vaga nova, JobEnrichment.COMPLETED dispara)
  → MonitorProfileMatchJob (1 por usuário, dispara no 1º acesso ao Monitor e em toda edição de perfil relevante)
  → UserJobRecommendation (nível ≥3 persistido; viewed/dismissed/superseded)
  → MonitorDigestScheduler (descobre quem é devido hoje) → MonitorDigest (PENDING)
  → MonitorDigestWorker (envia via Resend) → MonitorDigestEvent (delivered/opened/clicked/bounced/complained via webhook)
```

## 2) Superfície técnica

### 2.1 Endpoints de usuário (`apps/api/src/monitor/`)

- `GET/PUT /api/monitor/profile` — alias fino sobre `UserRadarProfileService` (o Monitor nunca tem perfil próprio); PUT dispara rematch.
- `GET /api/monitor` — feed paginado (`UserJobRecommendation`).
- `GET /api/monitor/count` — badge de não-vistos.
- `PATCH /api/monitor/:id/viewed|dismiss|feedback`.
- `GET/PUT /api/monitor/alert-preferences` — `emailEnabled` + `frequency` (DAILY/WEEKLY/OFF).
- `GET /api/monitor/access` — único ponto que o frontend deve consultar pra saber se o usuário tem acesso (`{allowed, reason}`); só `JwtAuthGuard`, sem `MonitorEntitlementGuard` (precisa responder mesmo quando negado).
- Todos os endpoints acima (exceto `/access`) exigem `JwtAuthGuard + MonitorEntitlementGuard`.

### 2.2 Endpoints públicos (sem login) — `monitor-public.controller.ts`

- `GET /api/monitor/unsubscribe?token=` — só valida o token e mostra página de confirmação, NUNCA muta.
- `POST /api/monitor/unsubscribe?token=` — efetiva o cancelamento (clique manual ou one-click RFC 8058); idempotente.
- `POST /api/monitor/webhooks/resend` — eventos de entrega/abertura/clique/bounce/complaint (Svix signature).

### 2.3 Painel admin de diagnóstico (`apps/api/src/admin-monitor/`, `/admin/monitor` no frontend)

Guardado por `JwtAuthGuard + RolesGuard` (`internalRole` admin/superadmin). Ver seção 7.

### 2.4 Workers/schedulers (todos param no `NODE_ENV=test`)

| Worker | Cron | Lote | Tentativas | Stale threshold |
|---|---|---|---|---|
| `MonitorMatchingWorker` (vaga → perfis) | `*/15 * * * * *` (15s) | 25 | 3 | 10 min |
| `MonitorProfileMatchingWorker` (perfil → vagas, backfill/rematch) | `*/15 * * * * *` (15s) | 5 | 3 | 10 min |
| `MonitorDigestScheduler` (decide quem é devido) | `EVERY_DAY_AT_1PM` (13h no fuso do servidor — Railway roda em UTC) | — | — | — |
| `MonitorDigestWorker` (envia o digest) | `*/30 * * * * *` (30s) | 10 | 3 | 10 min |

Constantes relevantes (só mudam via código, não têm env var hoje):
- `MIN_RECOMMENDATION_LEVEL = 3` — só nível 3+ vira `UserJobRecommendation`.
- `BACKFILL_WINDOW_DAYS = 30` — backfill só olha vagas com `firstSeenAt` nos últimos 30 dias.
- `MAX_CANDIDATE_JOBS = 500` / `RECONCILE_BATCH_SIZE = 300` — teto por execução do profile-matching worker.
- Digest WEEKLY roda sempre na segunda-feira (UTC) — `isWeeklyDigestDay` em `monitor-digest-schedule.util.ts`.

### 2.5 Modelos (`packages/database/prisma/schema.prisma`)

`UserRadarProfile` (campo `monitorStatus`/`matchFingerprint`/`lastMatchedAt`), `UserJobRecommendation`, `MonitorMatchJob`, `MonitorProfileMatchJob`, `MonitorAlertPreference`, `MonitorDigest`, `MonitorDigestRecommendation`, `MonitorDigestEvent`, `MonitorAdminActionLog` (auditoria das ações do painel admin).

## 3) Variáveis de ambiente para parametrizar

| Variável | Obrigatória? | Efeito |
|---|---|---|
| `DATABASE_URL` | sim | já compartilhada com o resto da API. |
| `FRONTEND_URL` | sim (prod) | base dos links do digest (`/monitor?...`); default `http://localhost:3000` em dev. |
| `API_URL` | sim (prod) | base do link de unsubscribe (`/api/monitor/unsubscribe?token=`); default `http://localhost:4000` em dev. |
| `MONITOR_DIGEST_UNSUBSCRIBE_SECRET` | **sim** | HMAC do token de unsubscribe. Sem ela, `createMonitorUnsubscribeToken` lança erro (nunca assina "inseguro"); `verifyMonitorUnsubscribeToken` retorna `null` (nunca derruba a app, só invalida o link). |
| `RESEND_API_KEY` | só p/ envio real | sem ela, `EmailModule` cai no `FakeEmailDeliveryService` (loga no console, não envia). |
| `APP_ENV=production` | só p/ envio real | **as duas** (`RESEND_API_KEY` + `APP_ENV=production`) precisam estar setadas pro Resend real ser usado — só uma não basta (ver `email.module.ts`). |
| `EMAIL_FROM` | não | default `EarlyCV <noreply@earlycv.com.br>`. |
| `RESEND_WEBHOOK_SECRET` | **sim** p/ tracking | sem ela, `POST /api/monitor/webhooks/resend` responde 401 sempre (`webhook not configured`) — silenciosamente não quebra nada, só não processa eventos. Formato: o secret que o Resend gera ao criar o webhook (prefixo `whsec_`). |
| `NODE_ENV=test` | só em teste | desliga os 4 crons acima (senão os testes de unidade rodariam contra timers reais). |

Nenhuma dessas 3 críticas (`MONITOR_DIGEST_UNSUBSCRIBE_SECRET`, `RESEND_API_KEY`+`APP_ENV`, `RESEND_WEBHOOK_SECRET`) tem fallback inseguro — a ausência degrada pra "não faz a ação", nunca pra "faz sem proteção".

## 4) Como rodar localmente

1. Suba a API e o Web normalmente (`npm run dev` nos respectivos workspaces). Sem `RESEND_API_KEY`/`APP_ENV=production`, os e-mails caem no `FakeEmailDeliveryService` e aparecem no console da API (`📧 [fake-email] ...`) — suficiente pra testar o fluxo sem gastar cota do Resend.
2. Garanta `MONITOR_DIGEST_UNSUBSCRIBE_SECRET` setado no `.env` local (qualquer string), senão o link de unsubscribe do digest não é gerado.
3. Os workers de matching rodam a cada 15s/30s automaticamente enquanto a API está de pé — não precisa disparar nada manualmente, só esperar o próximo tick (ou usar o botão "Reenfileirar"/"Forçar rematch" do painel admin pra não esperar).
4. `MonitorDigestScheduler` só roda uma vez por dia (13h) — pra testar o digest sem esperar até lá, veja a seção 5.3.

## 5) Como testar manualmente (ponta a ponta)

### 5.1 Matching por vaga nova

1. Garanta um usuário com `UserRadarProfile` configurado (`areas` não-vazio) — acontece automaticamente ao completar o CV master no Radar.
2. Ingerir/enriquecer uma vaga nova (`JobEnrichment.enrichmentStatus = COMPLETED`) — dispara a criação de um `MonitorMatchJob` (`jobId` único).
3. Espere até 15s (ou reenfileire pelo painel admin) — o `MonitorMatchingWorker` casa a vaga contra os perfis candidatos (pré-filtro por área/senioridade) e, pra quem pontuar nível 3+, cria `UserJobRecommendation`.
4. Confirme em `/admin/monitor/vagas/:jobId` — "recommendationStats" deve refletir a nova recomendação.

### 5.2 Backfill/rematch de perfil

1. Usuário novo entrando no Monitor pela primeira vez: `GET /api/monitor` chama `ensureMonitorInitialized`, que cria um `MonitorProfileMatchJob` se `lastMatchedAt` ainda for `null`.
2. Edição de perfil (`PUT /api/monitor/profile`): só reenfileira se o **fingerprint** mudou (areas/skills/technologies/seniority/languages/preferredWorkModels — os únicos campos que `MatchingEngine.calculateScore` consome). Editar `openToRelocation` ou `preferredContractTypes`, por exemplo, não dispara nada — é esperado.
3. Espere até 15s — `MonitorProfileMatchingWorker` varre as vagas dos últimos 30 dias e reconcilia recomendações ativas (supersede quem deixou de bater, reativa quem voltou a bater, nunca reativa dismissed).
4. Confirme em `/admin/monitor/usuarios/:userId` — `monitorStatus` deve virar `ACTIVE`, `lastMatchedAt` preenchido.

### 5.3 Digest de e-mail (sem esperar até 13h)

Não há endpoint pra forçar a descoberta do dia manualmente hoje — as opções são:
- Chamar `MonitorDigestScheduler.discoverDue(new Date())` diretamente via um teste/script local, ou
- Inserir uma linha `MonitorDigest` `PENDING` direto no banco de dev com `scheduledFor` = hoje e recomendações associadas, ou
- Esperar o cron das 13h (mais simples em homologação).

Depois de existir uma linha `PENDING`, o `MonitorDigestWorker` processa em até 30s. Confirme:
- console (`FakeEmailDeliveryService`) ou caixa de entrada real (Resend) recebeu o e-mail;
- `/admin/monitor/usuarios/:userId` → seção Digests mostra `status=SENT` + `providerMessageId`.

### 5.4 Unsubscribe (GET nunca muta, POST muta)

1. Pegue o link de unsubscribe de um digest (corpo do e-mail ou monte manualmente com `createMonitorUnsubscribeToken`).
2. `GET /api/monitor/unsubscribe?token=...` — deve mostrar a página de confirmação **sem** desativar nada (confira `MonitorAlertPreference.emailEnabled` antes/depois — não muda).
3. Clique no botão da página (ou faça o `POST` direto) — agora sim `emailEnabled=false`, `unsubscribedAt` setado, evento `monitor_digest_unsubscribed` registrado.
4. Repita o `POST` — deve continuar retornando sucesso e **não** alterar `unsubscribedAt` de novo (idempotente).

### 5.5 Webhook do Resend

Em produção, configure o endpoint `https://<api>/api/monitor/webhooks/resend` no painel do Resend com o mesmo secret de `RESEND_WEBHOOK_SECRET`. Localmente, sem um túnel público (ngrok/similar) o Resend não alcança sua máquina — para testar o processamento do payload sem depender disso, use os testes automatizados (`resend-webhook-verifier.spec.ts`, `monitor-digest-webhook.service.spec.ts`) ou monte um POST manual assinado.

## 6) Testes automatizados

```bash
# Backend — feature completa (matching, digest, entitlement, admin, guards)
cd apps/api
npm test -- src/monitor/*.spec.ts src/admin-monitor/*.spec.ts src/common/roles.guard.spec.ts src/email/*.spec.ts src/radar/*.spec.ts

# Typecheck
npx tsc -p tsconfig.json --noEmit

# Frontend — telas de usuário do Monitor + admin
cd apps/web
npm run test:ui -- src/app/monitor src/app/admin/monitor src/components/monitor-nav-badge.test.tsx
npx tsc -p tsconfig.json --noEmit
```

O `admin-monitor.service.spec.ts` roda contra o banco de teste real (`DATABASE_TEST_URL`) — não usa fakes, porque exercita `groupBy`/filtros `isEmpty`/`mode: insensitive` do Prisma. Garanta que as migrations estejam aplicadas nesse banco (`npx prisma migrate deploy` com `DATABASE_URL` apontando pro banco de teste, dentro de `packages/database`).

## 7) Como monitorar em produção

### 7.1 Painel `/admin/monitor` (staff com `internalRole` admin/superadmin)

- **Visão geral** — usuários por `monitorStatus`, entitlement, recomendações ativas/novas/superseded/dismissed, filas por status, digests+eventos das últimas 24h.
- **Busca** por usuário (e-mail/nome/id) ou vaga (id/slug/cargo/empresa).
- **Diagnóstico de usuário** — entitlement real (nunca re-derivado), perfil (fingerprint vs. informativo), `MonitorProfileMatchJob`, recomendações filtráveis, digests+eventos, timeline de atribuição (correlação por userId+tempo, nunca clique único garantido).
- **Diagnóstico de vaga** — enrichment, `MonitorMatchJob`, quantos receberam nível 3+/visualizaram/salvaram/candidataram.
- **Explicação de matching** — score persistido (histórico) vs. "score atual recalculado" (via `MatchingEngine.calculateScore` agora), sempre em campos separados, nunca misturados.
- **Falhas** — FAILED de cada fila, PROCESSING preso além do limiar real dos workers (10 min), perfis presos em INITIALIZING/REFRESHING (30 min).
- **Ações** — reenfileirar `MonitorMatchJob`/`MonitorProfileMatchJob` FAILED, forçar rematch de um usuário, reenviar digest FAILED. Todas passam por `MonitorAdminActionLog` (quem, o quê, quando, resultado).

Guia rápido de investigação:

| Sintoma | Onde olhar |
|---|---|
| Usuário sem recomendação nenhuma | `/admin/monitor/usuarios/:id` → entitlement (`allowed`?) → `monitorStatus`/`lastMatchedAt` → `MonitorProfileMatchJob` (PENDING preso? FAILED? reenfileire) |
| Recomendação "errada" | `/admin/monitor/recomendacoes/:id` → compare score persistido × recalculado e o breakdown por dimensão |
| Monitor preso em REFRESHING | `/admin/monitor` → Falhas → "perfis presos"; ou no usuário, veja se há `MonitorProfileMatchJob` FAILED/PROCESSING travado |
| Digest não enviado | Histórico de digests do usuário → SKIPPED (sem elegíveis ou e-mail desativado) vs. FAILED (leia `lastError`, reenvie) |
| E-mail enviado sem clique | Eventos do digest → DELIVERED sem CLICKED é normal; OPENED é sempre indicativo, nunca "leu" |

### 7.2 PostHog / `BusinessFunnelEvent`

Eventos emitidos pelo Monitor (todos versionados em `analysis-event-version.registry.ts` e mapeados em `business-funnel-event-ownership.ts`):

- Backend: `monitor_profile_updated`, `monitor_recommendation_viewed`, `monitor_recommendation_dismissed`, `monitor_recommendation_feedback`, `monitor_recommendation_saved`, `monitor_digest_sent`, `monitor_digest_delivered`, `monitor_digest_opened` (sempre `indicative: true` no metadata), `monitor_digest_clicked`, `monitor_digest_bounced`, `monitor_digest_complained`, `monitor_digest_unsubscribed`.
- Frontend: `monitor_view` (mount da tela), `monitor_profile_viewed`, `monitor_recommendation_clicked` (clique no título), `monitor_application_started` (clique no CTA de adaptar/candidatar).
- Todos carregam `monitor_access_type` no metadata (valor = `MonitorEntitlementReason` — ver seção 8) e `product_origin: "monitor"` ou `"monitor_email"`.

Cadeia de atribuição conceitual: `monitor_digest_sent → monitor_digest_clicked → monitor_view → monitor_recommendation_clicked → monitor_application_started → payment_approved` — correlacionável só por `userId` + ordem temporal em `BusinessFunnelEvent`, nunca uma garantia de clique único (é assim tanto no painel admin quanto se você consultar o PostHog direto).

### 7.3 Auditoria de ações admin

`MonitorAdminActionLog` (sem UI de listagem própria ainda — consultar via banco):

```sql
select * from "MonitorAdminActionLog" order by "createdAt" desc limit 50;
```

Campos: `adminId`, `action` (`requeue_match_job` | `requeue_profile_match_job` | `force_user_rematch` | `resend_digest`), `entityType`, `entityId`, `result` (`ok` | `skipped`), `metadataJson`.

## 8) Como restringir o Monitor a pagantes (quando chegar a hora)

**Não é preciso redesenhar nada** — essa foi a decisão explícita desde a Fase 3.1: existe uma única abstração central, `MonitorEntitlementService` (`apps/api/src/monitor/monitor-entitlement.service.ts`), e **todo** ponto do sistema já consulta só ela:

- `MonitorEntitlementGuard` (todos os endpoints autenticados do Monitor);
- `MonitorProfileMatchService.ensureMonitorInitialized` / `.enqueueRematch` / `.forceRematch`;
- `MonitorMatchingWorker` (filtra candidatos por vaga nova);
- `MonitorProfileMatchingWorker` (backfill/rematch);
- `MonitorDigestScheduler` (descoberta diária);
- `MonitorDigestEmailService` (checado de novo no momento do envio, não só na descoberta);
- `GET /api/monitor/access` (leitura pelo frontend);
- painel admin (`AdminMonitorService`, nunca reimplementa a regra).

Hoje o corpo do método é a política de lançamento:

```ts
// apps/api/src/monitor/monitor-entitlement.service.ts
async canUseMonitor(_userId: string): Promise<MonitorEntitlementResult> {
  return { allowed: true, reason: "launch_access" };
}

async filterEntitledUserIds(userIds: string[]): Promise<Set<string>> {
  return new Set(userIds);
}
```

Para restringir a pagantes, **troque só o corpo destes dois métodos** — nenhum outro arquivo precisa mudar. `MonitorEntitlementReason` já tem os valores prontos pra usar (`"trial" | "active_subscription" | "manual_override" | "none"`, além do atual `"launch_access"`), então a UI/analytics (`monitor_access_type`) já sabem exibir/segmentar qualquer um deles sem mudança adicional.

Exemplo de implementação (ajuste ao modelo de plano real quando ele existir):

```ts
async canUseMonitor(userId: string): Promise<MonitorEntitlementResult> {
  const user = await this.database.user.findUnique({
    where: { id: userId },
    select: { planType: true, planExpiresAt: true },
  });
  if (!user) return { allowed: false, reason: "none" };

  if (user.planType !== "free" && (!user.planExpiresAt || user.planExpiresAt > new Date())) {
    return { allowed: true, reason: "active_subscription" };
  }

  // opcional: override manual (tabela dedicada ou flag em User)
  // opcional: trial com data de expiração

  return { allowed: false, reason: "none" };
}

async filterEntitledUserIds(userIds: string[]): Promise<Set<string>> {
  if (userIds.length === 0) return new Set();
  const entitled = await this.database.user.findMany({
    where: { id: { in: userIds }, planType: { not: "free" } /* + condição de vigência */ },
    select: { id: true },
  });
  return new Set(entitled.map((u) => u.id));
}
```

Pontos de atenção ao ativar a restrição:

1. **Nunca apaga histórico.** Perder entitlement só impede a criação de trabalho novo (matching, digest); `UserJobRecommendation`/`MonitorDigest` já existentes continuam intactos e consultáveis pelo admin (guard só bloqueia os endpoints de usuário, não o painel admin).
2. **Unsubscribe e webhook continuam abertos** mesmo sem entitlement — `MonitorPublicController` não tem `MonitorEntitlementGuard` de propósito (alguém sem acesso ainda precisa poder parar de receber e-mail).
3. **`filterEntitledUserIds` é a versão em lote** — usada por `MonitorMatchingWorker` (N candidatos de uma vaga) e `MonitorDigestScheduler` (N preferências do dia). Implemente com uma query `IN`, nunca com N chamadas individuais a `canUseMonitor`.
4. **Frontend**: `apps/web/src/app/monitor/page.tsx` já lê `getMonitorAccess()` e redireciona se `!allowed` — hoje isso nunca dispara (política sempre libera). Quando a restrição entrar, esse é o único lugar a decidir: hoje redireciona; se quiser uma tela de upgrade/paywall em vez de redirect, troque só ali.
5. **Não tem paywall de UI hoje** — de propósito (adendo de preparação, não implementação). Construir a tela de upgrade é trabalho novo de frontend, não uma mudança no entitlement.
6. Depois de trocar a regra, rode a suíte de testes do Monitor (seção 6) — ela já cobre "não entitled é ignorado por todo worker/scheduler" e "perder entitlement não apaga histórico" contra a implementação atual; adapte os fakes de `canUseMonitor`/`filterEntitledUserIds` nos specs se a assinatura mudar.

## 9) Checklist de produção (Resend)

- [ ] `RESEND_API_KEY` + `APP_ENV=production` setados (senão cai no fake e nenhum e-mail real sai).
- [ ] `RESEND_WEBHOOK_SECRET` setado, igual ao secret do webhook criado no painel Resend, apontando para `POST /api/monitor/webhooks/resend`.
- [ ] `MONITOR_DIGEST_UNSUBSCRIBE_SECRET` setado (segredo forte, não reaproveitar de outro uso).
- [ ] `FRONTEND_URL` e `API_URL` corretos em prod (links do digest e de unsubscribe).
- [ ] Domínio de envio no Resend com **click tracking** habilitado.
- [ ] Domínio de envio no Resend com **open tracking** habilitado, se quiser usar `opened` como métrica indicativa (nunca chamada de "leu" em nenhum lugar do produto).
- [ ] (Opcional, mais tarde) Custom tracking domain do Resend — algo como `links.earlycv.com.br` — pra não depender do domínio compartilhado de tracking. Não configurado ainda; ao provisionar, o Resend fornece o CNAME exato a cadastrar no DNS.

## 10) Rollback / desligar a feature sem apagar dado

Não existe um "kill switch" dedicado hoje (diferente do `analysis-protection`). Para desligar rapidamente sem tocar em dado:

- **Parar de enviar e-mail**: remover `RESEND_API_KEY` ou `APP_ENV=production` — volta pro fake delivery, zero envio real, zero mudança de schema.
- **Parar de gerar recomendações novas**: não há flag hoje — a forma limpa seria fazer `MonitorEntitlementService.canUseMonitor`/`filterEntitledUserIds` retornarem sempre `false`/vazio (mesmo mecanismo da seção 8), o que também bloqueia os endpoints de usuário via `MonitorEntitlementGuard`. Nada é apagado; só para de processar/expor.
- **Reverter uma ação admin indevida** (ex.: um resend de digest disparado por engano): não há "desfazer" automático — consulte `MonitorAdminActionLog` pra saber o que foi feito e trate manualmente (ex.: se um digest foi reenviado e a Idempotency-Key barrou o duplicado no Resend, nada de errado aconteceu de fato).
