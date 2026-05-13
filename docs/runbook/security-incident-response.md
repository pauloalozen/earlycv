# Runbook - Security Incident Response

Data: 2026-05-13
Escopo: API EarlyCV (analysis protection, upload/parser, pagamentos/webhooks, authz/admin)

## 1) Objetivo

Responder incidentes de seguranca sem vazar dados sensiveis e preservando evidencias tecnicas uteis.

## 2) Tipos de incidente cobertos

- Suspeita de bot/admin scan
- Abuso de upload/IA
- Anomalia de pagamento/webhook
- Negacao de autorizacao/ownership inesperada
- Suspeita de IDOR ou exposicao de dado pessoal

## 3) Checklist inicial (primeiros 15 minutos)

1. Identificar rota e evento principal observado.
2. Preservar identificadores de correlacao disponiveis:
   - `requestId`
   - `correlationId`
   - `purchaseId` / `paymentReference` / `mpPaymentId` (pagamento)
3. Verificar volume por IP/sessao/usuario e janela temporal.
4. Aplicar bloqueio defensivo (rate-limit/config) se necessario.
5. Medir impacto em usuarios e servico.
6. Se houver suspeita de token exposto, rotacionar segredo imediatamente.
7. Registrar timeline objetiva (hora, acao, resultado).
8. Avaliar necessidade de fluxo LGPD se houver dado pessoal afetado.

## 4) Preservacao de evidencia

- Coletar somente o necessario para investigacao:
  - eventos de `AnalysisProtectionEvent`
  - eventos de `BusinessFunnelEvent` relevantes
  - trilha de `PaymentAuditLog` (sanitizada)
  - logs de aplicacao com timestamps
- Nao copiar payload bruto completo de webhook/provedor para tickets ou chat.
- Nao anexar CV bruto, descricao completa de vaga, cookies, Authorization header, tokens ou base64/buffers.

## 5) Playbooks rapidos

### 5.1 Bot/admin scan

- Sinais: pico em `turnstile_*`, `rate_limit_block_*`, `duplicate_request_blocked`, `abuse_detected`.
- Acao:
  - confirmar `rollout_mode` e flags de protection;
  - endurecer limites gradualmente;
  - monitorar falso positivo em usuarios legitimos.

### 5.2 Abuso de upload/IA

- Sinais: aumento de `payload_invalid` com motivos de upload/parser e queda de `openai_request_success`.
- Acao:
  - validar se rejeicao ocorre antes da IA;
  - revisar distribuicao por `mimeType`, `fileExtension`, `fileSizeBytes`;
  - ajustar limites somente com evidencia.

### 5.3 Anomalia de pagamento/webhook

- Sinais: `payment_rejected`, `webhook_duplicated`, `webhook_transition_ignored`, `unexpected_error` acima do normal.
- Acao:
  - rastrear por `paymentReference`/`mpPaymentId`;
  - confirmar idempotencia e transicoes elegiveis;
  - comparar status do provider com status interno;
  - abrir incidente de provider se necessario.

## 6) O que NAO registrar/compartilhar

- CV completo (texto ou arquivo)
- Descricao completa da vaga
- Payload bruto completo de Mercado Pago/webhook
- Headers de autenticacao, cookies, tokens, segredos
- Resposta bruta completa de SDK de pagamento/IA

## 7) Encerramento do incidente

1. Confirmar estabilidade por janela minima acordada.
2. Registrar causa raiz e mitigacao aplicada.
3. Listar riscos residuais e follow-ups (P0/P1/P2).
4. Atualizar checklist de hardening quando houver mudanca permanente.

## 8) Escalacao e LGPD

- Escalar imediatamente para incident commander quando houver:
  - indicio de acesso indevido a dados de outro usuario;
  - suspeita de vazamento de credencial/token;
  - impacto em pagamento com potencial financeiro relevante.
- Acionar fluxo de avaliacao LGPD quando houver potencial exposicao de dado pessoal.
- Registrar decisao de severidade e responsavel pela aprovacao de comunicacao interna.

## 9) Timeline minima obrigatoria

Registrar no incidente:

1. hora de deteccao
2. rota/evento inicial
3. primeira acao de contencao
4. validacao de impacto
5. mitigacao aplicada
6. estado final e proximo passo
