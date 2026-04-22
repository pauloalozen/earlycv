# Analysis Protection Runbook Operacional

Data: 2026-04-22
Escopo: protecao e observabilidade de analise de CV (`analysis-protection` + `analysis-observability`)

## 1) Objetivo

Garantir que o pipeline protegido de analise opere com:

- bloqueio de abuso automatizado sem punir comportamento humano legitimo;
- controle de custo e previsibilidade operacional;
- rastreabilidade de decisao por telemetria e auditoria de configuracoes;
- capacidade de rollback rapido via runtime config sem deploy.

## 2) Superficie tecnica (o que o runbook cobre)

- API de configuracao protegida:
  - `GET /api/admin/analysis-protection/config`
  - `PATCH /api/admin/analysis-protection/config/:key`
- UI de operacao:
  - `/admin/configuracoes`
  - `/superadmin/configuracoes`
- Stream de eventos:
  - `AnalysisProtectionEvent`
  - `BusinessFunnelEvent`
  - `BusinessFunnelStageMetric`
- Purge/retencao:
  - script: `npm run analysis:purge-retention --workspace @earlycv/api`

## 3) Pre-requisitos de ambiente

### 3.1 Obrigatorios para funcionamento normal

- Banco com migration aplicada da slice de protection/observability.
- API com `requestContextMiddleware` ativo (ja padrao no bootstrap).
- Chave secreta Turnstile na API (um dos envs):
  - `CLOUDFLARE_TURNSTILE_SECRET_KEY`
  - `TURNSTILE_SECRET_KEY`
  - `TURNSTILE_SECRET`
- Site key no web:
  - `NEXT_PUBLIC_TURNSTILE_SITE_KEY`

### 3.2 Apenas para desenvolvimento/local

- `SKIP_TURNSTILE_VERIFICATION=true` (nao usar em producao).

## 4) Modelo de operacao recomendado por fase

### 4.1 Fase 1 (stabilization): observe-only

Config alvo:

- `rollout_mode = observe-only`
- `turnstile_enforced = true`
- `rate_limit_raw_enforced = true`
- `rate_limit_contextual_enforced = true`
- `dedupe_enforced = true`
- `daily_limit_enforced = true`
- `kill_switch_enabled = false`
- `auth_emergency_enabled = false`

Objetivo:

- medir taxa de bloqueio potencial e calibrar thresholds sem interromper usuarios validos.

### 4.2 Fase 2: soft-block

Quando entrar:

- telemetria mostra padrao estavel por 3-7 dias;
- sem indicio de falso positivo relevante.

Objetivo:

- bloquear sinais de alto risco mantendo tolerancia para casos de borda.

### 4.3 Fase 3: hard-block

Quando entrar:

- regras calibradas + indicadores saudaveis por janela estendida;
- playbook de incidente treinado.

Objetivo:

- enforcement deterministico completo das politicas configuradas.

## 5) Config baseline sugerida (seguranca + usabilidade)

Valores iniciais sugeridos:

- `rate_limit_raw_per_minute = 60`
- `rate_limit_contextual_per_minute = 30`
- `turnstile_max_token_age_ms = 120000`
- `dedupe_lock_ttl = 10s`
- `abuse_signal_threshold_percent = 85`
- `protected_routes_allowlist = ["/api/cv-adaptation/analyze", "/api/cv-adaptation/analyze-guest"]`

Notas:

- sempre manter `rate_limit_contextual_per_minute <= rate_limit_raw_per_minute`;
- prefira ajustes pequenos e incrementais (10-20%) por vez;
- cada mudanca deve registrar `source` e `technicalContext`.

## 6) Checklist diario (operacao)

1. Validar saude basica da API e fila de erros recentes.
2. Revisar volume de eventos por hora em `AnalysisProtectionEvent`.
3. Monitorar blocos por motivo:
   - `turnstile_invalid`
   - `rate_limit_block_initial`
   - `rate_limit_block_contextual`
   - `duplicate_request_blocked`
   - `daily_limit_block`
4. Comparar blocos vs sucesso de analise (`openai_request_success`) para detectar sobrebloqueio.
5. Revisar distribuicao de `rollout_mode`/origem de config (db/env/default).
6. Confirmar ausencia de mudanca nao autorizada no audit:
   - tabela `AnalysisProtectionConfigAudit`.
7. Se houver anomalia, aplicar gatilho de rollback da secao 9.

## 7) Checklist semanal (governanca)

1. Revisar tendencia de conversao do funil (`BusinessFunnelStageMetric`).
2. Correlacionar quedas de conversao com aumento de blocos de protection.
3. Revisar chaves high-risk alteradas na semana e aprovacoes associadas.
4. Rodar purge de retencao (ou validar job agendado):
   - `npm run analysis:purge-retention --workspace @earlycv/api`
5. Reavaliar parametros de limite/ttl com base em percentis reais de uso.
6. Revisar `protected_routes_allowlist` e manter principio de minimo necessario.

## 8) Politica de mudanca de configuracao

### 8.1 Regras

- alterar uma chave por vez quando possivel;
- documentar contexto tecnico e motivo;
- para chaves `risk=high`, exigir janela de observacao de 30-60 min;
- evitar mudancas simultaneas em `rollout_mode` e thresholds numericos.

### 8.2 Sequencia segura de alteracao

1. Conferir valor atual + origem no painel.
2. Definir novo valor e impacto esperado.
3. Aplicar alteracao no backoffice.
4. Observar eventos por 15 min (hot path).
5. Se estavel, manter; se degradar, rollback imediato.

## 9) Gatilhos de rollback (acao imediata)

Executar rollback para `observe-only` quando qualquer condicao ocorrer:

- aumento abrupto de erro de analise apos mudanca de config;
- queda significativa de conversao em etapas `analysis_started -> full_analysis_viewed`;
- crescimento persistente de `turnstile_invalid` sem mudanca de trafego esperada;
- aumento de reclamacoes de usuarios validos bloqueados;
- comportamento inesperado em rotas fora do allowlist.

### 9.1 Ordem de rollback recomendada

1. `rollout_mode = observe-only`
2. se necessario, desativar enforcement por camada:
   - `rate_limit_contextual_enforced = false`
   - `dedupe_enforced = false`
   - `daily_limit_enforced = false`
3. manter `turnstile_enforced = true` sempre que possivel.
4. usar `kill_switch_enabled = true` apenas em incidente severo.

## 10) Playbooks de incidente rapido

### 10.1 Falso positivo em massa

- Sintoma: pico de bloqueio com queda de conversao e relatos de usuarios legitimos.
- Acao:
  1. `rollout_mode -> observe-only`
  2. reduzir agressividade (`abuse_signal_threshold_percent` para cima)
  3. validar em 15-30 min

### 10.2 Ataque/flood evidente

- Sintoma: aumento de requests invalidos e pressao de custo.
- Acao:
  1. subir limites defensivos: reduzir `rate_limit_*_per_minute`
  2. manter `hard-block` se ruido alto
  3. opcional temporario: `auth_emergency_enabled = true`

### 10.3 Instabilidade de provider externo

- Sintoma: `openai_request_failed` elevado sem padrao de abuso.
- Acao:
  1. manter protection ativa
  2. evitar elevar bloqueio anti-bot sem evidencia
  3. acompanhar timeout/max-execution e status do provider

## 11) Politica de retencao sugerida

Sugestao inicial:

- `ANALYSIS_RETENTION_PROTECTION_EVENTS_DAYS=90`
- `ANALYSIS_RETENTION_BUSINESS_EVENTS_DAYS=180`
- `ANALYSIS_RETENTION_STAGE_METRICS_DAYS=365`

Observacao:

- projecoes (`BusinessFunnelStageMetric`) sao derivadas e podem ser reconstruidas.

## 12) Auditoria e conformidade interna

- Toda alteracao de config deve ficar em `AnalysisProtectionConfigAudit` com:
  - `actorId`
  - `actorRole`
  - `key`
  - `oldValueJson` / `newValueJson`
  - `source`
  - `technicalContextJson`
- Revisao minima semanal do audit para chaves de risco `high`.

## 13) Comandos uteis (operacao)

- Rodar testes alvo protection/observability:
  - `npm run test --workspace @earlycv/api -- "src/analysis-protection/*.spec.ts" "src/analysis-observability/*.spec.ts" src/cv-adaptation/cv-adaptation.e2e-spec.ts`
- Purge de retencao:
  - `npm run analysis:purge-retention --workspace @earlycv/api`
- Verificar build API:
  - `npm run build --workspace @earlycv/api`

## 14) Responsabilidade operacional

- Admin: operacao diaria e ajustes de baixo risco.
- Superadmin: alteracoes high-risk, rollout mode e incidentes.
- Regra de ouro: em duvida, priorizar continuidade segura com `observe-only` e evidencias de telemetria antes de endurecer bloqueio.
