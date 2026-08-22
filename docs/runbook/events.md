# Taxonomia de analytics — EarlyCV (fonte única de verdade)

Última revisão: 2026-08-21, no âmbito da spec `specs/analytics-v2-saneamento-evolucao-plan.md`
(Fases A+B, B.1 — contexto de conversão do signup e classificação de sessão —, B.2 —
`sessionInternalId` no OAuth —, B.3 — contexto de produto + Radar mínimo — e Fase C —
identidade estável de visitante anônimo, ver seção 2 "Identity model").

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

## 2. Identity model

Cinco identificadores coexistem, cada um respondendo uma pergunta diferente. Nunca são
intercambiáveis entre si nem substitutos uns dos outros:

| Identificador | Escopo | O que representa | Onde vive | Sobrevive a |
|---|---|---|---|---|
| `visitor_id` | Navegador/dispositivo | Pseudônimo persistente de storage — não é uma pessoa | `localStorage` (`earlycv_visitor_id`), frontend | reload, nova aba, fechar/reabrir o navegador, múltiplas sessões |
| `sessionInternalId` (UUID de jornada) | Jornada funcional | Uma "visita contínua" — reseta a cada nova sessão de navegador | `sessionStorage` (`journey_session_internal_id`), frontend | reload, nova aba na mesma sessão — **não** sobrevive fechar/reabrir o navegador |
| `$session_id` | Sessão PostHog | Janela de sessão do próprio PostHog (replay, pathing) | Gerenciado pelo SDK `posthog-js` | Timeout de inatividade do PostHog (não gerenciado pelo EarlyCV) |
| `user_id` | Conta autenticada | Identidade de conta EarlyCV — só existe após login/signup | Coluna `User.id` / JWT | Enquanto a conta existir; ausente pra visitantes anônimos |
| `distinct_id` (PostHog) | Identidade operacional do PostHog | Como o PostHog agrupa eventos de uma mesma "pessoa" | Gerenciado pelo SDK `posthog-js` (`ph_<key>_posthog`, localStorage/cookie próprios do SDK) | Reset explícito (`posthog.reset()`) ou troca de storage do PostHog |

`visitor_id` e `distinct_id` respondem perguntas parecidas mas são **sistemas
independentes**: `visitor_id` é first-party do EarlyCV, usado nas propriedades dos
nossos próprios `BusinessFunnelEvent`; `distinct_id` é interno ao SDK do PostHog e
governa exclusivamente como o PostHog agrupa/funde pessoas no próprio produto deles.
Não sincronizamos os dois nem gravamos `visitor_id` como `distinct_id` customizado —
ver auditoria abaixo.

### Auditoria do `distinct_id` (feita antes de qualquer mudança nesta fase)

`apps/web/src/app/_components/posthog-auth-provider.tsx` já implementa o padrão oficial
do SDK, sem necessidade de alterações:

- **Antes do login**: `posthog-js` gera e persiste seu próprio `distinct_id` anônimo
  automaticamente (config default do SDK, `person_profiles: "identified_only"`) —
  estável entre pageviews/reload igual a um `visitor_id` de fato, só que gerenciado
  inteiramente pelo SDK.
- **`identify()` acontece uma vez**, ao detectar `isAuthenticated: true` numa resposta
  de `/api/session` que ainda não tinha sido identificada nesta sessão de storage
  (`posthog.identify(userId)`, guardado por `posthog_identified_user_id` em
  `sessionStorage` pra não disparar de novo em remounts). Isso troca o `distinct_id`
  ativo pro `userId`, e o próprio SDK cuida do merge automático do
  `$anon_distinct_id` anterior — **nenhum `alias()` manual, nenhum merge no banco**.
- **`reset()` só acontece no logout explícito**, guardado por uma flag de
  1-shot (`analytics_auth_reset_allowed`, setada só quando o `journey-tracker-provider`
  intercepta o submit de `/auth/logout`) — nunca em resposta anônima transitória
  (ex.: token expirado momentaneamente numa race de refresh). `reset()` descarta a
  identidade de conta ativa no SDK e gera um novo `distinct_id` anônimo — comportamento
  correto e já existente, não alterado nesta fase.

Conclusão da auditoria: o mecanismo já resolvia exatamente o que a Fase C pede pro
`distinct_id` (estável antes do login, corretamente associado depois, sem merge
manual) — reaproveitado como está, zero mudanças no fluxo de `identify`/`reset`.

### `visitor_id` (Fase C)

Identificador pseudônimo persistente de navegador/dispositivo, para distinguir:
visitante novo vs. recorrente, e continuidade da mesma pessoa anônima entre múltiplas
sessões (`sessionInternalId` diferentes). **Nunca vira identidade permanente** — não é
substituto de `user_id`, não sobrevive limpeza de storage/troca de navegador/dispositivo
(não é fingerprinting).

**Formato fechado**: UUID puro via `crypto.randomUUID()` — sem prefixo, sem fallback
alternativo. Um navegador sem `crypto.randomUUID()` simplesmente não tem `visitor_id`
(`null`), nunca inventa um formato substituto (diferente de `sessionInternalId`, que
tem o fallback `journey-<timestamp>` — decisão deliberadamente diferente: `visitor_id`
prioriza um formato único e estritamente validável no backend sobre compatibilidade com
navegadores muito antigos).

**Decisão de storage: `localStorage`, fonte canônica única — não cookie.**
Justificativa: o app web e a API rodam em origens diferentes (browser → Next.js →
NestJS), então um cookie first-party setado pelo app web não chegaria automaticamente
nas rotas da API mesmo assim — a propagação pro backend sempre precisaria de um passo
explícito (header ou querystring), exatamente como já acontece com `sessionInternalId`
hoje. Diante disso, `localStorage` evita a complexidade adicional de TTL/SameSite/
Secure/consentimento de cookie sem nenhum ganho arquitetural real, e reaproveita
exatamente o mesmo mecanismo já usado por `analytics_first_touch_utm`/
`analytics_consent_status`. Criado sob o mesmo gate de consentimento de analytics já
existente (`isAnalyticsConsentGateEnabled`/`readAnalyticsConsentState`) — nunca
persistido antes do usuário aceitar, quando o gate está habilitado.

**Propagação**:
- **Frontend → eventos de produto**: `visitor_id` é propriedade comum de todo evento
  emitido via `trackEvent()`/`getAnalyticsBaseProperties()` — cobre automaticamente toda
  a lista de prioridade (`page_view`, `session_started`, `analyze_submit_clicked`,
  `analysis_result_viewed`, `radar_view`, `radar_opportunity_clicked`,
  `job_detail_viewed`, `buy_credits_clicked`, `checkout_started`, e qualquer outro
  evento frontend que passe por `trackEvent`) sem precisar tocar em cada call site
  individualmente.
- **Frontend → backend, correlação por request real de browser**: header
  `x-visitor-id`, mesmo padrão do `x-session-internal-id` da Fase B.3
  (`apps/api/src/common/visitor-id.ts` valida o formato; `requestContextMiddleware`
  popula `AnalysisRequestContext.visitorId`, central e reaproveitável por qualquer
  controller sem duplicar lógica). Nunca exigido em webhooks/server-to-server — ausência
  vira `null`, nunca erro de negócio.
- **Signup/login por senha**: campo hidden `visitorId` nos formulários
  (`login-form.tsx`/`register-form.tsx`, lido de `localStorage` via
  `getOrCreateVisitorId()`), submetido como body field pros endpoints
  `/auth/login`/`/auth/register` — mesmo padrão já usado por `sessionInternalId` nesses
  dois forms (campo de formulário, não header, porque a chamada real ao backend
  acontece dentro de um Route Handler do Next.js, não direto do browser).
- **OAuth (Google)**: mesmo princípio do `sessionInternalId` (Fase B.2) — `?vid=` em
  `/auth/google/start`, validado e gravado numa cookie httpOnly de curta duração
  (`oauth_visitor_id`, 10min, escopada em `/api/auth/google`, nunca na URL de callback),
  lida e limpa em `googleCallback` (`readAndClearOAuthVisitorId`) antes de chamar
  `finishSocialLogin`. Cookie ausente, expirada ou valor fora do formato UUID estrito
  nunca quebra o login — só resulta em `visitorId: null`.
- `signup_completed`/`login_completed` recebem `visitor_id` em `metadata` quando a
  jornada carregou um (nunca inventado quando a jornada não começou no browser — ex.:
  staff criando conta via admin).

### Visitor lifecycle — `new_visitor` / `returning_visitor` / `unknown`

Implementado em
`apps/api/src/analysis-observability/visitor-lifecycle-classification.ts` (função pura
`classifyVisitorLifecycle`) e `visitor-lifecycle-classification.service.ts`, seguindo
exatamente o mesmo padrão arquitetural de `journey-session-classification.ts`/`.service.ts`
(seção 5.2): **camada derivável, nunca gravada diretamente nos eventos**. Sempre
recalculada a partir do histórico real de `BusinessFunnelEvent` filtrado por
`metadata.visitor_id`. Exposta via
`GET /admin/analysis-observability/events/visitor-lifecycle/:visitorId/:sessionInternalId`
(mesma proteção admin/superadmin do endpoint de classificação de jornada).

Regra determinística: dado o conjunto de `sessionInternalId` distintos já vistos para um
`visitor_id`, a sessão cronologicamente mais antiga é a "primeira jornada conhecida"
daquele visitante — se a sessão sendo classificada é essa primeira, `new_visitor`; se
existe pelo menos uma sessão diferente e anterior, `returning_visitor`; sem sinais (ou a
sessão em questão nunca apareceu no histórico do visitor_id), `unknown`.

**Dimensão independente de `journey_user_type`** (a classificação da seção 5.2,
`new_user_journey`/`existing_user_journey`/`anonymous_journey`/`unknown`) — não
confundir as duas. Exemplos do enunciado da fase:

| Cenário | `visitor_lifecycle` | `journey_user_type` |
|---|---|---|
| Visitante recorrente que nunca criou conta | `returning_visitor` | `anonymous_journey` |
| Visitante novo que cria conta na primeira visita | `new_visitor` | `new_user_journey` |
| Visitante recorrente que finalmente cria conta | `returning_visitor` | `new_user_journey` |
| Usuário existente que volta e faz login | `returning_visitor` (normalmente) | `existing_user_journey` |

### Logout

`posthog.reset()` (seção acima) descarta só a identidade de CONTA ativa no PostHog —
nunca toca em `localStorage.earlycv_visitor_id`, que é uma chave própria do EarlyCV,
completamente separada do storage interno do SDK do PostHog. Depois do logout: a
próxima jornada (novo `sessionInternalId`) continua pertencendo ao mesmo navegador —
`visitor_id` idêntico ao de antes do logout; `user_id` deixa de existir até o próximo
login. Nenhum histórico de visitante é apagado por logout.

### Privacidade

`visitor_id` é estritamente pseudônimo — representa um navegador/storage, nunca uma
pessoa real. Nunca derivado de fingerprinting, IP persistido como identidade, hash de
e-mail/telefone, ou qualquer combinação de atributos para reidentificação. Gerado apenas
por `crypto.randomUUID()`, sem nenhuma entrada correlacionável.

- `product_origin` (Fase B.3) **não é** `conversion_context` nem UTM/`source`/`medium`.
  `conversion_context` responde "que jornada de marketing/aquisição levou a esse
  cadastro" (fechado no momento do signup). `product_origin` responde uma pergunta
  diferente e recorrente ao longo de toda a vida do usuário: "qual superfície de
  PRODUTO originou esta ação especifica" (análise, Radar, candidatura, dashboard, vaga
  SEO, acesso direto). Os dois convivem sem se sobrepor — um evento de análise pode ter
  `product_origin: radar` numa sessão cujo `conversion_context` foi `checkout` meses
  atrás. Ver seção 5.3 para o contrato completo.
- **Cuidado**: `sessionInternalId` existe em dois lugares com semânticas diferentes —
  a coluna `BusinessFunnelEvent.sessionInternalId` (FK pra `AnalysisSession`, usada só
  pelo pipeline de proteção/análise) e `metadata.sessionInternalId` (o UUID de jornada
  gerado no frontend, `journey_session_internal_id` em `sessionStorage`, usado por
  `page_view`/`signup_completed`/`login_completed` etc.). Escrever o UUID de jornada na
  coluna quebra com FK constraint violation — sempre usar `metadata`. Ver seção 5.2.
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
| analysis_started | backend | ativo | Emitido em `CvAdaptationService.processAnalysisJob` quando o job de análise passa a `processing` (aceito para processamento de fato). Frontend **não** emite mais este evento — a emissão antiga era rejeitada silenciosamente pelo backend por ownership mismatch. Propriedades (Fase B.3): + `product_origin` (`radar` quando o job carrega `radarJobId`, `direct` caso contrário — nunca inferido pela rota HTTP). |
| analysis_completed | backend | **novo (Fase B)** | Emitido quando o job de análise conclui com `status: succeeded`. Propriedades: `analysis_id`, `mode` (guest\|authenticated), `origin`, `processing_time_ms`, `cv_source` (master_cv\|upload), `product_origin` (Fase B.3, mesmo valor do `analysis_started` correspondente). |
| analysis_failed | backend | **novo (Fase B)** | Emitido na falha terminal do job (`status: failed`). Propriedades: `analysis_id`, `mode`, `origin`, `processing_time_ms`, `stage` (validation\|protection\|processing), `error_code` (taxonomia fechada), `retryable`, `product_origin` (Fase B.3). Sem mensagem de erro livre — só `job.lastError` na tabela, nunca no evento. |
| analysis_result_viewed | frontend | **novo (Fase B)** | Emitido em `/adaptar/resultado` quando o conteúdo do resultado efetivamente renderiza (`rawData` presente + auth status resolvido), não na simples chegada da rota. Idempotente por `routeVisitId`. |
| analyze_submit_clicked | frontend | ativo | Intenção do usuário — não representa início real da análise. |
| auth_session_identified | frontend | ambíguo | Mistura restauração de sessão e transição de auth. Não é proxy confiável de signup nem de login novo. Não usar em funis de conversão sem essa ressalva. |
| auth_oauth_redirect_started | frontend | ativo | |
| blog_cta_clicked / blog_index_viewed / blog_post_viewed | frontend | ativo | |
| seo_page_cta_clicked / seo_page_viewed | frontend | ativo | |
| cta_signup_click | frontend | ativo | |
| buy_credits_clicked | frontend | ativo | |
| checkout_abandoned / checkout_started | frontend | ativo | `checkout_started.payment_method` é sempre `"unknown"` — comportamento esperado, não bug (Fase B.3): o método real só é conhecido depois, quando o Brick/Checkout Pro do Mercado Pago resolve a forma de pagamento escolhida. O valor real aparece em `payment_failed.paymentMethod`/no fluxo de `payment_approved` mais adiante, nunca em `checkout_started`. |
| checkout_brick_ready | frontend | **registrado (Fase A)** | Brick de pagamento pronto. Emitido de `pagamento/checkout/[purchaseId]/page.client.tsx`. Já era emitido em produção mas era rejeitado pelo backend por não estar no registry — corrigido. |
| checkout_brick_submit_started | frontend | **registrado (Fase A)** | Usuário submeteu o brick. |
| checkout_brick_submit_failed | frontend | **registrado (Fase A)** | Falha de submissão no client/SDK antes de aprovação transacional. |
| cv_unlock_started / cv_unlock_completed | frontend | ativo | `cv_unlock_completed.remainingCredits` (Fase B.3, bug corrigido): antes hardcoded `0`; agora envia o saldo real quando disponível de forma confiável, ou `null` quando não — nunca mais um `0` fictício. |
| cv_upload_completed | backend | **corrigido (Fase A)** | Antes emitido pelo frontend na simples seleção local do arquivo (nunca chegava a ser aceito pelo backend, era rejeitado por ownership mismatch). Agora emitido em `CvAdaptationService.analyzeGuest`/`analyzeAuthenticated` logo após `validateCvFileEnvelope` aceitar o arquivo. |
| dashboard_viewed | frontend | ativo | |
| optimized_cv_downloaded | frontend | ambíguo (semântica documentada, Fase B.3) | Representa clique/início de tentativa de download, **não** download confirmado/transferência completa — nenhum evento hoje confirma que o arquivo chegou a ser salvo pelo usuário. Emitido em dois pontos: `/adaptar/resultado` (original) e `/adaptacao-cv/[id]` (Fase B.3 — cobertura corrigida; antes só `/adaptar/resultado` emitia, deixando de fora boa parte dos downloads finais que acontecem nessa tela pós-unlock). Mesmo evento nos dois lugares, mesma semântica. Propriedades: `format` (pdf\|docx), `adaptation_id` (quando disponível), `product_origin`. Não renomear histórico; se no futuro for necessário confirmar entrega de fato, criar evento distinto (`optimized_cv_download_confirmed` ou similar), nunca sobrecarregar este. |
| full_analysis_viewed | backend | **stale catalog** | Está no registry/ownership mas não há emissor real no código hoje. Mantido por compatibilidade histórica; não usar em dashboards novos. |
| job_description_focus / job_description_filled / job_description_paste | frontend | ativo | |
| landing_cta_click | frontend | ativo | |
| login_completed | backend | **implementado (Fase B.1)** | Exclusivo de autenticação EXPLÍCITA numa conta já existente: senha via `AuthService.login` (`/auth/login`) e login social que resolve pra conta pré-existente em `finishSocialLogin`. Nunca emitido em `refresh()`/restauração de sessão. Propriedades: `user_id`, `login_method` (`password`\|`google`\|`linkedin`), `sessionInternalId` quando disponível, `visitor_id` quando disponível (Fase C). Sem idempotencyKey — cada login explícito é um evento novo por natureza. |
| page_leave | frontend | ativo | |
| payment_return_viewed | frontend | ativo | Retorno/visualização pós-provedor. Não representa aprovação. |
| plan_selected | frontend | ativo | |
| site_exit | frontend | **deprecated** | Sem emissor real confirmado no código atual. Mantido no registry por histórico; não emitir eventos novos. |
| site_exit_candidate | frontend | **deprecated** | Tem emissor real (`journey-tracker-provider.tsx`), mas não entrega semântica confiável (spec 5.3). Mantido ativo tecnicamente, mas não deve ser usado como fonte para métricas de produto novas. |
| page_view | frontend | ativo | Jornada interna — ver seção 1. |
| payment_approved | backend | ativo | Fonte oficial de pagamento aprovado e receita. Propriedades (Fase B.3): + `product_origin`, resolvido a partir de `PlanPurchase.originAdaptationId → JobApplication.currentCvAdaptationId → JobApplication.jobId` (não-nulo ⇒ `radar`, nulo ⇒ `analysis`, sem adaptação de origem ⇒ `direct`, erro na resolução ⇒ `unknown` — nunca quebra o registro do evento). `sessionInternalId` **não** é propagado aqui (ver seção 5.4, gap residual documentado). |
| payment_failed | backend | ativo | Propriedades (Fase B.3): `paymentMethod` — bug corrigido, antes hardcoded `"pix"`; agora vem de `payment_type_id` do payload real do Mercado Pago, ou `"unknown"` quando não disponível, nunca um valor adivinhado. `product_origin` — mesma resolução de `payment_approved` (`unknown` quando a compra não é resolvida). |
| session_engaged / session_started | frontend | ativo | |
| signup_completed | backend | **implementado (Fase B), contexto corrigido (Fase B.1)** | Emitido em `AuthService.register` (signup por senha) e `AuthService.finishSocialLogin` (apenas quando a conta é criada de fato — não em login social de conta pré-existente, que agora emite `login_completed`). Propriedades: `user_id`, `signup_method` (`password`\|`google`\|`linkedin`), `is_guest_conversion`, `conversion_context` (conjunto fechado: `analysis_guest`\|`checkout`\|`direct_auth`\|`radar`\|`unknown`), `sessionInternalId` quando disponível, `visitor_id` quando disponível (Fase C). Idempotente por `user_id`. Não representa login nem restauração de sessão. Ver seção 5.1 para o contrato completo de `conversion_context`, seção 2 para `visitor_id`. |
| signup_started | frontend | ativo | |
| teaser_scroll / teaser_viewed | frontend/backend | ativo | |
| unlock_cv_click | frontend | ativo | |
| candidaturas_page_viewed / candidatura_created / candidatura_detail_viewed / candidatura_status_changed / candidatura_marked_as_applied / candidatura_archived / candidatura_deleted / candidatura_note_added / candidatura_rejection_feedback_submitted | ver registry | ativo | Módulo de Candidaturas. Fase B.3: `candidatura_created` ganhou `product_origin` (`candidatura` na criação manual; `radar`\|`analysis` na criação automática via `upsertFromCvAdaptation`, conforme `radarJobId`) e `idempotencyKey` por `application_id` (`candidatura_created:<id>`). `candidatura_marked_as_applied` ganhou `idempotencyKey` por `application_id` (`candidatura_marked_as_applied:<id>`) — marco por candidatura, não por transição. `candidatura_archived` ganhou `idempotencyKey` escopado à própria transição (`candidatura_archived:<id>:<timestamp>`) — rearquivar após restaurar é ação legítima e distinta, a chave só evita duplicidade de corrida na mesma transição. `candidatura_note_added` **não** ganhou idempotência — notas repetidas são ações legítimas e distintas, deduplicar quebraria o caso de uso. Todos os eventos backend do módulo ganharam `sessionInternalId` opcional em `metadata` quando o request carrega `x-session-internal-id` (ver seção 5.4). |
| radar_view | frontend | ativo | Fase B.3: cobre agora todas as superfícies de listagem do Radar (`/radar`, `/radar/area/[area]`, `/radar/junior`, `/radar/senior`, `/radar/remotas`, `/radar/tecnologia/[tech]`, `/radar/empresa/[empresa]`), não só a home. Idempotente por `routeVisitId + radar_view` (`idempotencyKey: <routeVisitId>:radar_view`). Propriedades `radar_view_type`, `area`, `seniority`, `technology`, `remote_filter` incluídas só quando realmente disponíveis — nunca valores fictícios. |
| radar_opportunity_clicked | frontend | **novo (Fase B.3)** | Clique numa oportunidade apresentada pelo Radar (listagem principal, carrossel de similares na listagem, carrossel de similares no detalhe). Propriedades: `job_id`, `product_origin: radar`, posição na lista (`position`, quando disponível de forma estável), filtros ativos (`active_filters`, quando disponíveis). **Sem** idempotência global — cliques distintos são ações reais, cada clique gera um evento novo; a implementação só evita duplo-disparo do mesmo handler, não dedupe entre cliques. |
| job_detail_viewed | frontend | **novo (Fase B.3)** | Detalhe de vaga efetivamente renderizado — serve Radar, página pública/SEO de vaga e acesso direto, mesmo evento para os três (nunca eventos separados por origem). `product_origin` resolvido por prefixo exato de `previous_route`: começa com `/radar` → `radar`; sem `previous_route` (primeiro pageview da sessão) → `seo_job`; qualquer outra rota interna → `direct`. Nunca inferido por heurística de hostname/referrer. Idempotente por `routeVisitId + job_detail_viewed`. |
| interview_prep_* | ver registry | ativo | `interview_prep_generated` ganhou `sessionInternalId` opcional em `metadata` (Fase B.3, ver seção 5.4). |
| cover_letter_* | ver registry | ativo | `cover_letter_generated` ganhou `sessionInternalId` opcional em `metadata` (Fase B.3, ver seção 5.4). |

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

## 5.1 `conversion_context` (Fase B.1) — contrato fechado, nunca inferido

O backend **nunca** deduz a origem de um cadastro a partir de heurística (rota, referrer,
`next` etc.). O frontend envia `conversionContext` explicitamente; ausência ou valor fora
do conjunto fechado colapsa em `unknown` — nunca em `direct_auth` por omissão silenciosa.

Conjunto fechado (`SIGNUP_CONVERSION_CONTEXTS` em
`apps/api/src/auth/dto/register.dto.ts`): `analysis_guest`, `checkout`, `direct_auth`,
`radar`, `unknown`.

| Contexto | Onde é setado |
|---|---|
| `analysis_guest` | CTA de criar conta em `/adaptar/resultado` (resultado de análise guest) — `?ctx=analysis_guest` |
| `checkout` | Redirect pra `/entrar` a partir do fluxo de planos/checkout (`plans/checkout/route.ts`, `planos/page.tsx`) — `?ctx=checkout` |
| `radar` | CTAs de criar conta no Radar (`radar/[slug]/page.tsx`, `radar/jobs-listing.tsx`, `radar/save-job-btn.tsx`) — `?ctx=radar` |
| `direct_auth` | Entrada direta em `/entrar` sem `ctx` na URL (nav, landing, footer) — é o default explícito que a própria página `/entrar` resolve, não um fallback do backend |
| `unknown` | Fallback do backend quando o campo está ausente/inválido no payload (cliente antigo, chamada direta à API, valor fora do enum) |

`is_guest_conversion` só é `true` quando `conversion_context === "analysis_guest"` — é a
única jornada guest conhecida no conjunto hoje.

**Cadastro por senha**: `RegisterForm` lê `?ctx=` (resolvido em `entrar/page.tsx`) e manda
como campo hidden `conversionContext` no POST pra `/auth/register-user` → `/auth/register`.

**OAuth (Google)**: o valor não pode ir na URL de callback (token + PII já trafegam ali) nem
depender de cookie cross-domain frágil. Em vez disso: `GoogleAuthButton` manda `?ctx=` pra
`/auth/google/start` (mesmo padrão já usado pra `next`); um middleware
(`captureOAuthSignupContextMiddleware`, registrado só nessa rota via
`AuthModule.configure()`) valida contra o enum e grava numa cookie httpOnly de curta duração
(10min), escopada em `/api/auth/google` — a cookie nunca sai do domínio da API, não há
round-trip cross-origin. `googleCallback` lê e limpa a cookie
(`readAndClearOAuthSignupContext`) antes de chamar `finishSocialLogin`. Valor adulterado ou
ausente sempre colapsa em `unknown` — nunca quebra o login.

**`sessionInternalId` no OAuth (Fase B.2)**: mesmo princípio, cookie irmã
(`OAUTH_JOURNEY_SESSION_COOKIE`, mesmo path `/api/auth/google`, mesmo TTL de 10min).
`GoogleAuthButton` lê `journey_session_internal_id` do `sessionStorage` no client e manda
`?sid=` pra `/auth/google/start` — nunca aparece na URL de callback. O mesmo middleware
`captureOAuthSignupContextMiddleware` valida o formato rigorosamente (UUID de
`crypto.randomUUID()` ou o fallback `journey-<timestamp>` que o frontend usa quando
`crypto.randomUUID` não existe — qualquer outro formato é descartado, nunca gravado na
cookie) antes de gravar. `googleCallback` lê e limpa via
`readAndClearOAuthJourneySessionId` e propaga pra `finishSocialLogin`, que passa adiante pra
`recordSignupCompleted`/`recordLoginCompleted` — então `signup_completed` de conta nova via
Google e `login_completed` de conta Google já existente carregam o mesmo
`sessionInternalId` da sessão que começou o fluxo, alimentando a classificação de jornada da
seção 5.2. Cookie ausente/expirada ou valor fora do formato -> `sessionInternalId: null`,
nunca quebra o login.

## 5.2 Classificação de jornada por sessão — new_user_journey / existing_user_journey / anonymous_journey / unknown

Implementado em `apps/api/src/analysis-observability/journey-session-classification.ts`
(função pura `classifyJourneySession`) e
`journey-session-classification.service.ts` (`JourneySessionClassificationService`, que
carrega o histórico real de `BusinessFunnelEvent` de um `sessionInternalId` via filtro JSON
`metadataJson.sessionInternalId` e aplica a função pura). Exposto para consumo por
dashboards via `GET /admin/analysis-observability/events/journey-classification/:sessionInternalId`
(protegido por `JwtAuthGuard`/`RolesGuard`, admin/superadmin) — uma camada derivável e
sempre recalculada a partir do histórico de eventos, não um valor persistido/denormalizado
nos eventos em si (não dá pra saber se uma sessão vai terminar em `signup_completed` no
momento em que o primeiro evento dela é gravado).

Conjunto fechado (`JOURNEY_SESSION_CLASSIFICATIONS`): `anonymous_journey`,
`new_user_journey`, `existing_user_journey`, `unknown`.

Prioridade de classificação (determinística, dado o mesmo conjunto de eventos sempre produz
o mesmo resultado):

1. sessão contém `signup_completed` → `new_user_journey` (a conta não existia antes; nasceu
   nesta jornada — vale para qualquer origem: homepage, SEO, Radar, vaga pública, parceiro,
   `/adaptar`. A origem nunca muda a classificação.)
2. sessão contém `login_completed`, sem `signup_completed` → `existing_user_journey`
   (autenticação explícita numa conta que já existia).
3. primeiro evento da sessão (por `createdAt`) já chega com `metadata.isAuthenticated ===
   true`, sem `login_completed`/`signup_completed` → `existing_user_journey` (sessão de
   jornada nova mas com token válido de conta pré-existente).
4. nenhum evento da sessão jamais autenticado → `anonymous_journey`.
5. qualquer outro caso (sinais contraditórios — `signup_completed` e `login_completed` na
   mesma sessão —, virou autenticado no meio da sessão sem `login_completed`/
   `signup_completed` observável, ou sessão sem nenhum evento) → `unknown`. Nunca inferido
   por heurística adicional.

Regras deliberadamente **não** usadas, por instrução explícita:
- **"tem `user_id`" como filtro**: usar isso classificaria erroneamente como
  `existing_user_journey` qualquer sessão nova que converteu (ganhou `user_id` só depois do
  próprio `signup_completed`). A função só olha `isAuthenticated` do *primeiro* evento pra
  decidir "começou logado", e eventos com autenticação aparecendo no meio da sessão sem um
  evento explícito de login/signup caem em `unknown`, não em `existing_user_journey`.
- **`auth_session_identified` como critério**: é evento técnico (mistura
  restauração/transição de auth), nunca tratado como prova de novo cadastro nem de login —
  nem sozinho nem combinado com `isAuthenticated`.

Dashboards de aquisição (fora do escopo desta rodada) devem excluir jornadas classificadas
como `existing_user_journey`, mesmo que os primeiros eventos daquela sessão tenham ocorrido
anonimamente antes do login — e nunca usar o estado *atual* da pessoa como filtro, o que
excluiria também quem converteu de fato durante o funil.

## 5.3 `product_origin` (Fase B.3) — superfície de produto, não origem de marketing

Enum fechado (`PRODUCT_ORIGINS`, espelhado em
`apps/api/src/analysis-observability/product-origin.ts` e
`apps/web/src/lib/product-origin.ts`): `radar`, `analysis`, `candidatura`, `dashboard`,
`seo_job`, `direct`, `unknown`.

Representa qual superfície funcional de PRODUTO originou uma ação específica — não a
origem de aquisição/marketing (isso é `conversion_context` + UTM/`source`/`medium`, ver
seção 5.1, contratos independentes e não intercambiáveis). Não existe uma supercolumn
global `feature` em todo evento — o mapeamento evento canônico → feature (seção 5.5) já
resolve segmentação por feature sem precisar de um campo genérico redundante em toda
linha.

Regra dura: quando a origem não é determinável com confiança, `product_origin: unknown`
— nunca uma inferência frágil (nunca deduzido só pela rota HTTP, por exemplo
`cv-adaptation/analyze` não vira `product_origin` sozinho).

Como é resolvido, por evento:

- `analysis_started` / `analysis_completed` / `analysis_failed`: `radar` quando o job de
  análise carrega `radarJobId` (guest ou autenticado); `direct` caso contrário. O
  frontend já enviava `radarJobId` incondicionalmente em ambos os fluxos
  (`apps/web/src/app/adaptar/page.tsx`) — o guest endpoint só não estava lendo o campo,
  corrigido nesta fase.
- `candidatura_created`: `candidatura` na criação manual (sempre — não existe caminho
  manual vindo do Radar); `radar` ou `analysis` na criação automática via
  `upsertFromCvAdaptation`, reaproveitando a relação já existente
  `radarJobId → Job.id → AnalysisJob → JobApplication.jobId` (sem join adicional em
  tempo de análise só para analytics — o campo já é persistido na criação da
  candidatura).
- `payment_approved` / `payment_failed`: resolvido a partir de
  `PlanPurchase.originAdaptationId → JobApplication.currentCvAdaptationId (lookup
  reverso) → JobApplication.jobId` (não-nulo ⇒ `radar`, nulo ⇒ `analysis`, sem
  adaptação de origem ⇒ `direct`). Erro na resolução (ex.: falha transitória de DB) ⇒
  `unknown`, nunca quebra o registro do evento de pagamento em si — a resolução roda em
  `try/catch` isolado.
- `radar_opportunity_clicked`: sempre `radar` — o próprio evento só existe dentro do
  Radar.
- `job_detail_viewed`: ver tabela da seção 4 (resolvido por `previous_route`).
- `optimized_cv_downloaded`: `radar` \| `candidatura` \| `analysis`, resolvido por
  `previous_route` no momento do clique de download (`/radar` ⇒ `radar`,
  `/candidaturas` ⇒ `candidatura`, qualquer outra rota interna ⇒ `analysis` — a tela de
  resultado/adaptação em si não tem "Radar" nem "Candidaturas" como conceito próprio).

## 5.4 `sessionInternalId` em eventos de produto backend (Fase B.3)

Objetivo: correlacionar eventos de uso de produto (geração de carta, interview prep,
candidaturas, pagamento) com a classificação de jornada da seção 5.2
(`new_user_journey`/`existing_user_journey`/`anonymous_journey`/`unknown`) — hoje só
`page_view`/`signup_completed`/`login_completed` carregavam esse UUID de forma
consistente.

**Padrão de propagação (browser → Server Action → NestJS API)**: o frontend lê o UUID
de jornada de `sessionStorage` (`getJourneySessionInternalId()` em
`apps/web/src/lib/journey-session.ts`) e passa como parâmetro final das funções de
`apps/web/src/lib/job-applications-api.ts` (Server Actions `"use server"`), que por sua
vez passam pra `apiRequest()` (`apps/web/src/lib/api-request.ts`), que grava no header
HTTP `x-session-internal-id` só quando o valor está presente — nunca inventa um. Na API,
`requestContextMiddleware` (`apps/api/src/analysis-protection/request-context.middleware.ts`)
lê o header, valida o formato com o mesmo validador rigoroso usado no fluxo OAuth
(`apps/api/src/common/journey-session-id.ts` — UUID de `crypto.randomUUID()` ou o
fallback `journey-<timestamp>`) e grava em
`AnalysisRequestContext.journeySessionInternalId`. Formato inválido ou header ausente ⇒
`null`, nunca quebra o request.

**Regra dura, igual à do OAuth (seção 5.1)**: o UUID de jornada só é escrito em
`metadata.sessionInternalId` do evento — **nunca** na coluna
`BusinessFunnelEvent.sessionInternalId` (FK pra `AnalysisSession`, ver seção 2). Quando
o request não carrega contexto confiável, o campo fica ausente de `metadata` (não é
enviado como `null` explícito nem inventado) — ver os eventos cobertos na seção 4.

Eventos cobertos nesta fase (lista priorizada da spec, todos com `sessionInternalId`
opcional em `metadata`): `cover_letter_generated`, `interview_prep_generated`,
`candidatura_created`, `candidatura_status_changed`, `candidatura_marked_as_applied`,
`candidatura_archived`, `candidatura_deleted`, `candidatura_note_added`,
`candidatura_rejection_feedback_submitted`.

**Gap residual documentado, aceito conscientemente**: `payment_approved` e
`payment_failed` **não** recebem `sessionInternalId` nesta fase. Ambos costumam disparar
via webhook servidor-a-servidor do Mercado Pago, sem nenhum contexto de browser vivo no
momento do processamento. Propagar exigiria persistir o UUID de jornada em
`PlanPurchase` no momento da criação do checkout (migration de schema) — fora do escopo
de B.3. Ver seção "riscos residuais" na entrega da fase.

## 5.5 Evento canônico por feature (sem supercolumn `feature`)

A camada futura de BI/PostHog mapeia feature a partir do evento canônico, sem precisar
de uma propriedade genérica `feature` replicada em todo evento:

| Feature | Evento canônico |
|---|---|
| Analysis | `analysis_completed` |
| CV | `cv_unlock_completed` |
| Cover Letter | `cover_letter_generated` |
| Interview Prep | `interview_prep_generated` |
| Applications (Candidaturas) | `candidatura_created` / `candidaturas_page_viewed` |
| Radar | `radar_opportunity_clicked` |

## 5.6 Retenção — derivada de repetição temporal, não evento dedicado

Não existe (e não deve ser criado) um evento tipo `user_retained`/`returning_user`.
Retenção é derivada, na camada de análise/dashboard, a partir da repetição temporal de
eventos já existentes (ex.: mais de um `analysis_completed` do mesmo `user_id` em
janelas de tempo distintas, ou `session_started` recorrente) — nunca um evento novo
gravado em runtime só para marcar "esse é um retorno".

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
