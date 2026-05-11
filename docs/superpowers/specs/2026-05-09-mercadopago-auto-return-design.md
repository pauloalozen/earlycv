# Design: Mercado Pago auto-return global no EarlyCV

## Contexto e problema

Hoje, parte dos pagamentos aprovados no Mercado Pago ainda exige acao manual do usuario para voltar ao EarlyCV. Isso ocorre quando o checkout nao retorna automaticamente para as rotas de `back_urls.success`.

O produto ja possui fluxos de fallback robustos (`/pagamento/concluido`, `/pagamento/pendente`, polling e webhook), entao o objetivo desta mudanca nao e refatorar UX nem regras de negocio. O objetivo e garantir que o comportamento nativo de auto-retorno do Mercado Pago esteja configurado de forma consistente em **qualquer fluxo que gere pagamento**.

## Objetivo

Padronizar a criacao de preferencias do Mercado Pago para sempre configurar:

- `back_urls.success`
- `back_urls.failure`
- `back_urls.pending`
- `auto_return: "approved"` (quando `success` for HTTPS)

Escopo: todos os fluxos atuais de checkout MP no backend do EarlyCV.

## Fora de escopo

- Alterar regras de desbloqueio/creditos.
- Alterar logica de webhook.
- Alterar telas de retorno (`/pagamento/concluido`, `/pagamento/pendente`, `/pagamento/falhou`) alem do necessario para manter compatibilidade.
- Bloquear checkout quando ambiente nao estiver em HTTPS.

## Abordagens consideradas

### 1) Ajuste pontual apenas em `cv-adaptation`

**Pro:** mudanca pequena.
**Contra:** nao atende requisito aprovado de valer para qualquer acao de pagamento.

### 2) Duplicar ajuste em cada service de pagamento

**Pro:** entrega rapida.
**Contra:** risco de divergencia futura entre fluxos, manutencao pior.

### 3) Padronizacao compartilhada de configuracao MP (recomendada)

**Pro:** garante consistencia global, reduz drift entre fluxos, facilita evolucao.
**Contra:** pequena complexidade inicial para extrair util comum.

Decisao: **abordagem 3**.

## Design tecnico

### 1) Builder compartilhado para retorno MP

Criar um helper backend para montar configuracao de retorno do Mercado Pago, recebendo:

- `frontendUrl`
- rotas relativas de `success/failure/pending`

Saida:

- `back_urls` sempre preenchido
- `auto_return: "approved"` apenas quando `back_urls.success` iniciar com `https://`
- metadado de diagnostico (`successUrlIsHttps`, `autoReturnEnabled`) para log

### 2) Aplicacao nos fluxos de pagamento existentes

Aplicar o helper em:

- `apps/api/src/cv-adaptation/cv-adaptation-payment.service.ts`
- `apps/api/src/plans/plans.service.ts`

Substituir montagem inline de `back_urls`/`auto_return` por uso do builder, mantendo URLs e query params atuais de cada fluxo.

### 3) Observabilidade padronizada

Ao criar preferencia MP, logar informacoes nao sensiveis:

- tipo do fluxo (`cv_adaptation` ou `plan_purchase`)
- id interno (`adaptationId` ou `purchaseId`)
- `frontendHost`
- `successUrlIsHttps`
- `autoReturnEnabled`

Se `successUrlIsHttps === false`, emitir `warn` explicito (sem bloquear fluxo):

- checkout segue normalmente
- mensagem deixa claro que auto-retorno pode nao funcionar sem HTTPS

Nao logar access token, assinatura, payload completo sensivel ou dados pessoais desnecessarios.

## Fluxo de execucao esperado

1. Backend cria preferencia MP com `back_urls` e (quando cabivel) `auto_return: "approved"`.
2. Usuario conclui pagamento aprovado no MP.
3. MP retorna automaticamente para URL `success` do EarlyCV.
4. Fluxo atual do produto segue (polling/webhook/fallbacks) sem alteracao.

## Compatibilidade e resiliencia

- Em producao com `FRONTEND_URL=https://earlycv.com.br`, auto-return deve operar normalmente.
- Em ambientes sem HTTPS, checkout continua funcional e observavel via `warn`.
- Fallback atual continua valido para cenarios de atraso de confirmacao, expiracao de sessao ou comportamentos especificos do MP.

## Plano de testes

### Unitarios

- helper retorna `auto_return: "approved"` quando success e HTTPS.
- helper nao retorna `auto_return` quando success nao e HTTPS.
- helper sempre retorna `back_urls` consistentes.

### Integracao/service

- `cv-adaptation-payment.service`: preferencia criada com campos esperados.
- `plans.service`: preferencia criada com campos esperados.

### Verificacao manual

- Em ambiente HTTPS, iniciar pagamento em cada fluxo (adaptacao e planos), aprovar no MP e validar retorno automatico para rota `success` sem clique manual.
- Em ambiente nao HTTPS, validar continuidade do checkout e emissao de `warn`.

## Riscos e mitigacoes

- **Risco:** `FRONTEND_URL` incorreto no deploy (dominio/protocolo).
  - **Mitigacao:** logs objetivos + checklist operacional de env.
- **Risco:** regressao por implementacoes duplicadas futuras.
  - **Mitigacao:** centralizar em helper compartilhado e cobrir com testes.

## Rollout

- Sem feature flag (mudanca de configuracao de preferencia).
- Deploy normal.
- Monitorar logs de criacao de preferencia nas primeiras horas para confirmar `autoReturnEnabled=true` em producao.

## Criterios de aceite

- Qualquer fluxo que gere pagamento via Mercado Pago cria preferencia com `back_urls` corretos.
- Em HTTPS, preferencia inclui `auto_return: "approved"`.
- Pagamentos aprovados retornam automaticamente ao EarlyCV sem clique manual no MP.
- Em nao HTTPS, sistema nao bloqueia checkout e registra alerta claro.
