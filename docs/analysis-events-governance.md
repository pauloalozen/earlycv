# Analysis Events Governance

Data: 2026-04-22

Guia rapido para evoluir eventos de `analysis-protection` e `analysis-observability` sem quebrar consistencia de funil e telemetria.

## 1) Como adicionar novo evento

1. Defina o evento no registry de versao:
   - `apps/api/src/analysis-observability/analysis-event-version.registry.ts`
2. Para eventos de funil, defina ownership:
   - `apps/api/src/analysis-observability/business-funnel-event-ownership.ts`
3. Se o evento for de funil frontend, emita via `emitBusinessFunnelEvent` no web app.
4. Se for backend, registre via `BusinessFunnelEventService.record(..., "backend")`.
5. Adicione testes de aceite cobrindo registro e validações.

## 2) Como versionar evento

- Todo evento deve ter versao explicita no registry.
- Nao existe fallback silencioso.
- `analysis-protection` resolve versao automaticamente pelo nome do evento.
- `business-funnel` valida `eventVersion` recebido contra o registry.

Regra pratica:

- Mudanca breaking de payload/semantica: incrementar versao e atualizar produtores/consumidores.
- Mudanca nao-breaking: manter versao.

## 3) Como definir ownership FE vs BE

Ownership existe para evitar duplicidade semantica do mesmo evento entre frontend e backend.

- Arquivo: `apps/api/src/analysis-observability/business-funnel-event-ownership.ts`
- Valores validos: `frontend` ou `backend`

Enforcement:

- Backend rejeita evento emitido por fonte que nao e dona daquele evento.

## 4) Como ajustar retencao

Variaveis de ambiente:

- `ANALYSIS_RETENTION_PROTECTION_EVENTS_DAYS`
- `ANALYSIS_RETENTION_BUSINESS_EVENTS_DAYS`
- `ANALYSIS_RETENTION_STAGE_METRICS_DAYS`

Execucao:

- Job automatico diario: `AnalysisRetentionScheduler` (`@Cron("0 2 * * *")`).
- Execucao manual quando necessario:
  - `npm run analysis:purge-retention --workspace @earlycv/api`

## 5) Checklist minimo de PR para eventos

- registry atualizado
- ownership atualizado (se funil)
- testes de versao/ownership/idempotencia atualizados
- sem mudanca de endpoint/contrato externo nao planejada
