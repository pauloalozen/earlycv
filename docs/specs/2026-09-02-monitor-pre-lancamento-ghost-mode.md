# Pré-lançamento do Alerta de Vaga Certa (ghost mode) — status

**Branch:** `pré-lançamento-monitor` (criada a partir de `develop`, commit `28d3ac9`, ainda não mergeada)
**Data:** 2026-09-02

## Contexto

Preparar o lançamento controlado do Alerta de Vaga Certa (nome interno "Monitor"): validar o fluxo completo em produção (matching, digest, e-mail, clique, análise, candidatura) só para admin/superadmin via `JOBS_GHOST_MODE`, sem expor a feature à base, e corrigir a atribuição de origem da jornada que uma auditoria de analytics anterior encontrou quebrada.

Precedido por: auditoria de analytics do Alerta (achou a lacuna de atribuição) → levantamento de entraves técnicos → plano aprovado. Ver histórico da conversa para o raciocínio completo; este documento é só o resumo do que foi implementado.

## O que foi implementado (commit `28d3ac9`)

1. **`MonitorEntitlementService`** deixou de liberar todo mundo (hardcoded). Agora:
   - `JOBS_GHOST_MODE=true` (env do serviço `@earlycv/api`, Railway) → só `internalRole` admin/superadmin têm acesso.
   - `JOBS_GHOST_MODE=false` → fechado pra todo mundo (`reason: "none"`) — ainda sem regra comercial real (trial/plano), sem persistência nova de entitlement (decisão explícita: isso fica pra uma fase futura).
   - Novo helper `apps/api/src/common/jobs-ghost-mode.ts` lê a env var direto (sem replicar o padrão `AnalysisConfigService`).
   - Nenhum controller/worker/scheduler mudou — todos já dependiam só deste serviço (`filterEntitledUserIds`/`canUseMonitor`).
2. **404 real** em `/alerta-vaga-certa` (server-side, `notFound()`) quando `!access.allowed` — antes era um redirect.
3. **Menu/CTAs**: corrigido um bug em `public-nav-bar.tsx` onde o link do Alerta sumia até para admin durante ghost mode (sem bypass de role). CTA da landing (`_feature-showcase.tsx`, variante E) e o CTA de cadastro em `/radar/[slug]` (`SIGNUP_NEXT_MONITOR`) agora ficam escondidos com ghost mode ligado — **antes não tinham checagem nenhuma**, era um vazamento real.
4. **Atribuição da jornada** (Alerta/e-mail → vaga → salvar → análise → candidatura), que se perdia entre o clique no card de recomendação e a página da vaga:
   - `journey-session.ts` generalizado (`origin: "radar" | "monitor" | "monitor_email"`, peek em vez de consume-once).
   - `monitor-recommendation-card.tsx` agora grava o marcador de origem antes de navegar (faltava).
   - `job-detail-view-tracker.tsx` reconhece `/alerta-vaga-certa` no fallback por rota.
   - `SaveJobTextBtn` resolve `origin` real (RADAR/MONITOR) em vez de assumir sempre RADAR.
   - `product_origin` propagado até `analysis_started/completed` e `candidatura_created` via novo campo `radarJobOrigin` nos DTOs de análise (`AnalyzeCvDto`, `SaveGuestPreviewDto`) — threading só no fluxo autenticado (`analyzeMasterCvForJob`/`AnalysisCtaButtons`/`AnalyzeCardBtn`), já que o Alerta é 100% autenticado.
   - Unificada a divergência de nomenclatura `"direct"` vs `"analysis"` pro mesmo caso (sem radarJobId) — os dois passam a usar `"direct"`.
5. **`monitor_alert_frequency_changed`** (novo evento backend-owned, registrado nos 3 lugares obrigatórios) cobre DAILY↔WEEKLY↔OFF em qualquer direção, sem confundir com `monitor_digest_unsubscribed` (exclusivo do fluxo de e-mail/token).
6. **Resend**: nada mudou — `digestId`/`recommendationId` já estavam na URL do digest.

**Sem migration Prisma nesta entrega.**

## Testes

Typecheck limpo em `apps/api` e `apps/web`. Suítes rodadas e verdes: módulo Monitor completo (133 testes), `cv-adaptation.service` (108), `job-applications.service` (55), `posthog-integration`/`analysis-observability`/`common` (107), lado web tocado — journey-session, job-detail-view-tracker, radar-opportunity-link, save-job-btn, monitor-recommendation-card, páginas de acesso, CTAs de ghost mode (84). Suíte completa do monorepo não foi rodada (só os módulos relevantes).

## Estado das env vars (confirmado com o Paulo em 2026-09-02)

- Railway (`@earlycv/api`, produção): `JOBS_GHOST_MODE=false` hoje.
- Vercel (web, produção): `NEXT_PUBLIC_JOBS_GHOST_MODE=true` hoje.
- Os dois precisam ficar sincronizados manualmente — não há fonte única entre as duas plataformas. O valor do **Railway** é quem decide o bloqueio real (rota/API/matching/e-mail); o da **Vercel** só decide se o link aparece no menu.

## Pontos em aberto antes do merge/deploy (Paulo vai decidir com calma)

1. **`/meu-perfil` também linka pro Alerta** (`hero-state.ts`, `page.tsx:489,718`) — já usa o padrão correto de gate (`isJobsGhostModeEnabled` + `canAccessJobsInGhostMode`), mas o Paulo levantou que precisa olhar esse fluxo com calma antes de decidir o rollout. Não foi alterado nesta entrega.
2. **Hoje o acesso real ao Alerta já está aberto** (entitlement hardcoded liberando todo autenticado) — qualquer usuário que já tenha descoberto a URL direta (ex.: pelo CTA da landing, que não tinha gate) pode já ter usado o Alerta de verdade, inclusive configurado preferência de e-mail. Depois do deploy com `JOBS_GHOST_MODE=true`, esses usuários não-staff perdem acesso silenciosamente (comportamento correto, mas é uma mudança real pra quem já estava usando).
   - **Pendente**: checar no banco de produção se existe algum `MonitorAlertPreference` de usuário não-staff hoje, antes do deploy — oferecido, ainda não executado.
3. Branch **não mergeada em `develop`** — aguardando decisão do Paulo depois de resolver os pontos acima.

## Onde continuar

Retomar por aqui: revisar o ponto do `/meu-perfil`, rodar o levantamento do banco (item 2), decidir os valores finais das duas env vars, e então mergear `pré-lançamento-monitor` em `develop`.
