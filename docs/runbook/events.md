# Taxonomia de analytics — EarlyCV (fonte única de verdade)

Última revisão: 2026-08-21, no âmbito da spec `specs/analytics-v2-saneamento-evolucao-plan.md` (Fases A+B).

Este documento é a referência viva da taxonomia. Doc antiga (versão anterior deste
arquivo, com contagem "52 eventos" e lista incompleta) estava divergente do código e
foi substituída por este conteúdo. Fonte de verdade real em runtime:

- `apps/api/src/analysis-observability/analysis-event-version.registry.ts` (nomes + versão)
- `apps/api/src/analysis-observability/business-funnel-event-ownership.ts` (dono: frontend | backend)
- `apps/api/src/posthog-integration/posthog-event-exporter.service.ts` (mapeamento pro PostHog)

Se este doc divergir do código, o código vence. Atualize aqui ao mexer nos registries.

## 1. Arquitetura de papéis

- **GA4**: aquisição e web analytics (usuários, sessões, canais, SEO). Não usar `page_view`
  customizado como fonte de "unique visitors" no GA4.
- **PostHog `$pageview`**: analytics nativo do PostHog (session replay, pathing).
- **`page_view` (custom)**: jornada interna EarlyCV — `previous_route`, `routeVisitId`,
  `sessionInternalId`, persistido em `BusinessFunnelEvent`, usado em Sankey/funis internos.
- **Eventos de produto**: camada comportamental (análise, unlock, checkout, candidaturas,
  Radar, interview prep, cover letter).
- **Eventos backend**: fonte definitiva para eventos transacionais (`payment_approved`,
  `analysis_completed`, `analysis_failed`, `signup_completed`).

Nenhum evento deve tentar servir aquisição + jornada interna + semântica transacional ao
mesmo tempo.

## 2. Identidade (estado atual — Fase C ainda não implementada)

- `visitor_id` **não existe ainda**. Planejado na Fase C da spec, fora de escopo desta rodada.
- `sessionInternalId` (jornada EarlyCV) e `$session_id` (PostHog) coexistem — não são
  equivalentes, não tratar como intercambiáveis em dashboards.
- `user_id` é o campo canônico de usuário autenticado nos eventos EarlyCV. `userId` é
  legado mantido por compatibilidade durante a transição.

## 3. Eventos AnalysisProtectionEvent (27, todos v1, source interno)

abuse_detected, cache_hit, cache_miss, canonical_hash_generated, cooldown_block,
daily_limit_block, dedupe_lock_acquired, duplicate_request_blocked, kill_switch_blocked,
kill_switch_passed, openai_request_failed, openai_request_started, openai_request_success,
payload_invalid, payload_valid, rate_limit_block_contextual, rate_limit_block_initial,
rate_limit_contextual_passed, rate_limit_raw_passed, turnstile_expired, turnstile_invalid,
turnstile_missing, turnstile_unavailable, turnstile_unconfigured, turnstile_valid,
usage_policy_passed.

Semântica de telemetria de proteção (rate limit, turnstile, dedupe), não de funil de
produto. Não confundir com `BusinessFunnelEvent`.

## 4. BusinessFunnelEvent — catálogo (todos v1)

| Evento | Owner | Status | Notas |
|---|---|---|---|
| analysis_started | backend | ativo | Emitido em `CvAdaptationService.processAnalysisJob` quando o job de análise passa a `processing` (aceito para processamento de fato). Frontend **não** emite mais este evento — a emissão antiga era rejeitada silenciosamente pelo backend por ownership mismatch. |
| analysis_completed | backend | **novo (Fase B)** | Emitido quando o job de análise conclui com `status: succeeded`. Propriedades: `analysis_id`, `mode` (guest\|authenticated), `origin`, `processing_time_ms`, `cv_source` (master_cv\|upload). |
| analysis_failed | backend | **novo (Fase B)** | Emitido na falha terminal do job (`status: failed`). Propriedades: `analysis_id`, `mode`, `origin`, `processing_time_ms`, `stage` (validation\|protection\|processing), `error_code` (taxonomia fechada), `retryable`. Sem mensagem de erro livre — só `job.lastError` na tabela, nunca no evento. |
| analysis_result_viewed | frontend | **novo (Fase B)** | Emitido em `/adaptar/resultado` quando o conteúdo do resultado efetivamente renderiza (`rawData` presente + auth status resolvido), não na simples chegada da rota. Idempotente por `routeVisitId`. |
| analyze_submit_clicked | frontend | ativo | Intenção do usuário — não representa início real da análise. |
| auth_session_identified | frontend | ambíguo | Mistura restauração de sessão e transição de auth. Não é proxy confiável de signup nem de login novo. Não usar em funis de conversão sem essa ressalva. |
| auth_oauth_redirect_started | frontend | ativo | |
| blog_cta_clicked / blog_index_viewed / blog_post_viewed | frontend | ativo | |
| seo_page_cta_clicked / seo_page_viewed | frontend | ativo | |
| cta_signup_click | frontend | ativo | |
| buy_credits_clicked | frontend | ativo | |
| checkout_abandoned / checkout_started | frontend | ativo | |
| checkout_brick_ready | frontend | **registrado (Fase A)** | Brick de pagamento pronto. Emitido de `pagamento/checkout/[purchaseId]/page.client.tsx`. Já era emitido em produção mas era rejeitado pelo backend por não estar no registry — corrigido. |
| checkout_brick_submit_started | frontend | **registrado (Fase A)** | Usuário submeteu o brick. |
| checkout_brick_submit_failed | frontend | **registrado (Fase A)** | Falha de submissão no client/SDK antes de aprovação transacional. |
| cv_unlock_started / cv_unlock_completed | frontend | ativo | |
| cv_upload_completed | backend | **corrigido (Fase A)** | Antes emitido pelo frontend na simples seleção local do arquivo (nunca chegava a ser aceito pelo backend, era rejeitado por ownership mismatch). Agora emitido em `CvAdaptationService.analyzeGuest`/`analyzeAuthenticated` logo após `validateCvFileEnvelope` aceitar o arquivo. |
| dashboard_viewed | frontend | ativo | |
| optimized_cv_downloaded | frontend | ambíguo | Hoje tende a representar clique/início de tentativa de download, não download confirmado. Não renomear histórico; se necessário no futuro, criar evento distinto de "download entregue". |
| full_analysis_viewed | backend | **stale catalog** | Está no registry/ownership mas não há emissor real no código hoje. Mantido por compatibilidade histórica; não usar em dashboards novos. |
| job_description_focus / job_description_filled / job_description_paste | frontend | ativo | |
| landing_cta_click | frontend | ativo | |
| login_completed | backend | **stale catalog** | Registrado mas sem emissor real (só usado via ferramenta admin de emissão sintética). |
| page_leave | frontend | ativo | |
| payment_return_viewed | frontend | ativo | Retorno/visualização pós-provedor. Não representa aprovação. |
| plan_selected | frontend | ativo | |
| site_exit | frontend | **deprecated** | Sem emissor real confirmado no código atual. Mantido no registry por histórico; não emitir eventos novos. |
| site_exit_candidate | frontend | **deprecated** | Tem emissor real (`journey-tracker-provider.tsx`), mas não entrega semântica confiável (spec 5.3). Mantido ativo tecnicamente, mas não deve ser usado como fonte para métricas de produto novas. |
| page_view | frontend | ativo | Jornada interna — ver seção 1. |
| payment_approved | backend | ativo | Fonte oficial de pagamento aprovado e receita. Backend-only, não alterado nesta rodada. |
| payment_failed | backend | ativo | |
| session_engaged / session_started | frontend | ativo | |
| signup_completed | backend | **implementado (Fase B)** | Já existia no registry (não emitido). Agora emitido em `AuthService.register` (signup por senha) e `AuthService.finishSocialLogin` (apenas quando a conta é criada de fato — não em login social de conta pré-existente). Propriedades: `user_id`, `signup_method` (`password`\|`google`\|`linkedin`), `is_guest_conversion`, `conversion_context` (`analysis_guest`\|`checkout`\|`direct_auth`, default `direct_auth`). Idempotente por `user_id`. Não representa login nem restauração de sessão. |
| signup_started | frontend | ativo | |
| teaser_scroll / teaser_viewed | frontend/backend | ativo | |
| unlock_cv_click | frontend | ativo | |
| candidaturas_page_viewed / candidatura_created / candidatura_detail_viewed / candidatura_status_changed / candidatura_marked_as_applied / candidatura_archived / candidatura_deleted / candidatura_note_added / candidatura_rejection_feedback_submitted | ver registry | ativo | Módulo de Candidaturas — fora de escopo desta rodada. |
| radar_view | frontend | ativo | Radar — evolução planejada na Fase D (fora de escopo). |
| interview_prep_* | ver registry | ativo | |
| cover_letter_* | ver registry | ativo | |

### Ownership mismatch corrigido (Fase A)

`analysis_started` e `cv_upload_completed` já estavam marcados como `owner: backend` no
registry, mas o frontend (`apps/web/src/app/adaptar/page.tsx`) continuava emitindo os
dois no clique/seleção local. O backend rejeitava (400, ownership mismatch), então essas
emissões de frontend nunca chegavam a ser ingeridas — eram uma chamada de rede morta.
Removidas do frontend; emissão real agora só acontece no backend, no ponto de aceitação
real (ver tabela acima).

## 5. Eventos novos — Fase B (contrato completo)

Ver tabela acima para owner/propriedades resumidos. Detalhe adicional:

- **Idempotência**: `analysis_started`/`analysis_completed`/`analysis_failed` são
  chaveados por `analysisJob.id` (`analysis_started:<jobId>` etc.) — um job só pode gerar
  no máximo um `analysis_completed` OU um `analysis_failed`, nunca ambos, porque só um dos
  dois branches (`try`/`catch`) roda por execução do job.
- `signup_completed` é chaveado por `user_id` — mesmo usuário nunca gera duplicata mesmo
  que `register`/`finishSocialLogin` seja chamado mais de uma vez para a mesma conta (ex.:
  retry de rede).
- `cv_upload_completed` é chaveado por fingerprint do arquivo (hash do buffer), não por
  job — evita duplicar caso o mesmo arquivo seja reenviado no retry do mesmo request.

## 6. Versionamento

- Novo evento: quando a semântica muda de forma material ou o nome atual está ambíguo
  demais — preservar histórico é mais importante que "embelezar" taxonomia.
- Nova versão do mesmo nome: quando propriedade obrigatória muda, ou a semântica do mesmo
  nome muda mas vale manter o nome.
- Evento deprecado: mantido no registry/doc com status `deprecated`/`stale catalog`, nunca
  removido do histórico.

## 7. Canais internos de emissão

- `posthog:business-funnel-event-emitted`
- `posthog:protection-event-emitted`

(em `apps/api/src/posthog-integration/posthog-event-listener.ts`)
