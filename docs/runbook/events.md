Perfeito — fui no código e aqui está a lista completa do que existe hoje, separando por “registrado” vs “de fato emitido”.

Business funnel (registrados no contrato de eventos)  
adapt_page_view, analysis_started, analyze_submit_clicked, checkout_started, cv_upload_completed, cv_upload_started, dashboard_viewed,  
full_analysis_viewed, job_description_filled, landing_cta_click, landing_view, login_completed, purchase_completed, signup_completed,  
signup_started, teaser_viewed, unlock_cv_click

- Fonte: apps/api/src/analysis-observability/analysis-event-version.registry.ts:33

Ownership desses eventos (frontend vs backend)

- frontend: adapt_page_view, analyze_submit_clicked, cv_upload_started, dashboard_viewed, job_description_filled, landing_cta_click,  
  landing_view, signup_started, unlock_cv_click
- backend: analysis_started, checkout_started, cv_upload_completed, full_analysis_viewed, login_completed, purchase_completed,  
  signup_completed, teaser_viewed
- Fonte: apps/api/src/analysis-observability/business-funnel-event-ownership.ts:9

Eventos que o web realmente emite hoje (instrumentação atual)

- adapt_page_view
- analyze_submit_clicked
- analysis_started (emitido pelo web, mas ownership é backend)
- cv_upload_started
- cv_upload_completed (emitido pelo web, mas ownership é backend)
- job_description_filled
- Fonte: apps/web/src/app/adaptar/page.tsx:289, apps/web/src/app/adaptar/page.tsx:324, apps/web/src/app/adaptar/page.tsx:352, apps/web/src/  
  app/adaptar/page.tsx:771, apps/web/src/app/adaptar/page.tsx:910, apps/web/src/app/adaptar/page.tsx:1030

Conclusão direta para o seu caso (signup/CTA)

- signup_started, signup_completed, login_completed, landing_cta_click existem no contrato, mas não estão instrumentados no web/backend hoje  
  (não achei emissão deles em runtime).
- Por isso você clicou/fez cadastro e não viu esses eventos.

Se quiser, no próximo passo eu te entrego um patch já instrumentando exatamente esses 4 eventos nos pontos corretos (respeitando ownership).

Perfeito — aqui vai um changelog enxuto por área.

API

- Tracking/observability: ampliei registry/versionamento/ownership dos eventos de jornada e alinhei export para PostHog (incluindo cobertura
  de testes de mapeamento/paridade).
- Pagamentos: fluxo de webhook em plans agora trata melhor status terminal de falha e emite payment_failed com ownership backend.
- Testes corrigidos/estabilizados: ajustes em specs de telemetry, turnstile, social auth, cv-adaptation e resumes (incluindo regressões  
  preexistentes).
- Correção funcional: CreateResumeDto passou a tratar isPrimary opcional sem coerção indevida para false quando ausente.  


WEB

- Jornada global: adicionei provider de tracking (page_view, page_leave, session_started, session_engaged) e integração no template.
- /adaptar: instrumentação de micro-interações (cv_upload_clicked, foco/paste da descrição) sem quebrar fluxo/UX.
- /adaptar/resultado: instrumentação de download_cv_clicked e cta_signup_click, com continuidade de sessão/rota.
- Testes web estabilizados: separação clara entre suites node:test (_.spec.ts) e Vitest (_.test.ts(x)), renomeações de arquivos, fixes em  
  testes de UI (delta-badge, metric-bar, keyword-table) e atualização de specs antigas para refletir o comportamento atual.  


DOCS / MEMÓRIAS

- Atualizei memória do design em docs/superpowers/specs/2026-04-22-tracking-jornada-sankey-design.md para status implementado/verificado.
- Atualizei memória de execução em docs/superpowers/plans/2026-04-22-tracking-jornada-sankey-implementation.md com fechamento da entrega e  
  validação final.
- Também entraram runbooks novos (docs/runbook/events.md, docs/runbook/rotina-runbook.md) no mesmo commit.
