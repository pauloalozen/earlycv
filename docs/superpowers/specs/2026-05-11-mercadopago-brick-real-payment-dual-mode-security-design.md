# Design: Mercado Pago Brick real com modo dual (Pro/Brick) e hardening de seguranca

## Contexto

O Brick passou a carregar com selecao de meios de pagamento em producao, mas o submit ainda falha porque `submitBrickPayment` no backend esta em stub de dry-run. Em paralelo, o checkout Pro continua funcional e deve permanecer disponivel para fallback operacional.

Tambem existe risco de superficie de ataque em rota financeira se o fluxo real for liberado sem controles de validacao, idempotencia, sanitizacao de logs e anti-abuso.

## Objetivo

Implementar o fluxo real de pagamento com Payment Brick, mantendo dois modos selecionaveis (Pro e Brick) com chave unica de operacao (`PAYMENT_CHECKOUT_MODE`), sem popup no Brick, com redirecionamento imediato por status e com controles bloqueantes de seguranca para evitar vazamento e abuso.

## Decisoes aprovadas

1. Adotar arquitetura dual-mode:
   - `PAYMENT_CHECKOUT_MODE=pro`: manter fluxo atual Pro sem alteracoes de comportamento.
   - `PAYMENT_CHECKOUT_MODE=brick`: habilitar fluxo Brick embedded na mesma pagina.
2. No Brick, remover experiencia de popup/nova aba e processar pagamento na mesma tela.
3. Em resposta de submit do Brick:
   - `approved` imediato -> redirecionar para `/pagamento/concluido?checkoutId=...`
   - `pending`/`in_process` -> redirecionar para `/pagamento/pendente?checkoutId=...`
   - `rejected` -> permanecer na tela com erro seguro e legivel.
4. Simplificar envs removendo redundancia:
   - remover `PAYMENT_BRICK_ENABLED`
   - remover `PAYMENT_BRICK_ALLOWED_EMAILS`
   - remover `PAYMENT_BRICK_DRY_RUN`
   - remover `NEXT_PUBLIC_PAYMENT_BRICK_LOCAL_DEGRADED`
   - manter `PAYMENT_CHECKOUT_MODE` como seletor oficial.

## Fora de escopo

- Trocar provedor de pagamentos.
- Alterar regras de negocio de concessao de creditos fora do fluxo normal de compra aprovada.
- Reestruturar telas administrativas de auditoria alem do necessario para observabilidade minima.

## Arquitetura de alto nivel

### 1) Modo Pro (preservado)

- Continuidade do fluxo atual em `apps/web/src/app/planos/paid-plan-checkout-form.tsx`.
- Mantem aviso pre-redirecionamento, `window.open` e envio da aba atual para pendente.
- Nao recebe mudancas funcionais, apenas isolamento claro de branch de execucao.

### 2) Modo Brick (novo fluxo real)

- Compra de plano continua criando `purchase` no backend.
- Front redireciona para `/pagamento/checkout/[purchaseId]` quando modo efetivo for `brick`.
- Pagamento acontece embedded via Brick no mesmo documento (sem popup, sem nova aba).
- Submit chama `POST /payments/brick/:purchaseId/pay`.
- Backend cria pagamento real no MP (`/v1/payments`), persiste correlacao/status e retorna proxima acao para o frontend.

### 3) Fonte unica de decisao de modo

- O backend define o modo efetivo com base em `PAYMENT_CHECKOUT_MODE`.
- Frontend nao decide por heuristica local; apenas executa o modo retornado no payload de checkout.
- Endpoints de submit validam coerencia do modo para impedir uso cruzado indevido.

## Contrato de API (Brick real)

### Endpoint

- `POST /payments/brick/:purchaseId/pay`

### Entrada permitida (whitelist)

Aceitar apenas campos estritamente necessarios ao pagamento com cartao no Brick, por exemplo:

- `token` (obrigatorio)
- `payment_method_id` (obrigatorio)
- `installments` (obrigatorio, inteiro >= 1)
- `issuer_id` (opcional)
- `payer.email` (opcional, mas recomendado)
- `payer.identification.type/number` (opcional, somente se exigido por metodo)

Qualquer campo fora da whitelist deve ser ignorado e/ou causar rejeicao validada (conforme estrategia definida no codigo), sem refletir dados sensiveis no erro.

### Saida esperada

- `200 approved`:
  - `status: "approved"`
  - `purchaseId`
  - `checkoutMode: "brick"`
  - `redirectTo: "/pagamento/concluido?checkoutId=<purchaseId>"`

- `200 pending|in_process`:
  - `status: "pending"`
  - `purchaseId`
  - `checkoutMode: "brick"`
  - `redirectTo: "/pagamento/pendente?checkoutId=<purchaseId>"`

- `4xx rejected/invalid`:
  - `errorCode` estavel (`brick_payload_invalid`, `brick_payment_rejected`, `brick_purchase_not_pending`, `brick_mode_disabled`, etc.)
  - `message` segura para UX
  - sem stack trace, sem eco de payload, sem detalhes internos do MP.

## Fluxo backend detalhado (`submitBrickPayment`)

1. Autenticar usuario (guard ja existente).
2. Resolver `purchase` por `id + userId` (ownership obrigatoria).
3. Validar pre-condicoes:
   - compra existente
   - status permitido para tentar pagar (`pending`)
   - valor positivo
   - coerencia de origem (`unlock_cv` com adaptationId quando aplicavel)
   - modo efetivo `brick`.
4. Validar payload com schema estrito e whitelist.
5. Criar pagamento no MP via SDK `Payment.create` com:
   - `transaction_amount` derivado do `amountInCents`
   - `token`, `payment_method_id`, `installments`, `issuer_id` quando presente
   - `payer` validado
   - `external_reference` = `purchase.paymentReference`
   - `description` rastreavel (sem PII desnecessaria)
6. Persistir correlacao:
   - `mpPaymentId`
   - status interno mapeado
   - logs de auditoria sem dados sensiveis.
7. Branch por status MP:
   - `approved`: chamar `plansService.applyApprovedPurchase(purchase.id)` e responder `redirectTo` concluido.
   - `pending|in_process`: responder `redirectTo` pendente; confirmacao final via webhook/reconcile.
   - `rejected`: responder erro de negocio seguro (sem vazar motivo tecnico bruto).

## Controles bloqueantes de seguranca (gate de deploy)

Todos os itens abaixo sao obrigatorios antes de declarar fluxo pronto em producao:

1. **Validacao estrita de entrada**
   - schema tipado server-side
   - whitelist de campos
   - bloqueio de tipos invalidos e ranges inconsistentes.

2. **Sanitizacao e redaction de logs**
   - proibido logar payload bruto do Brick
   - redigir automaticamente `token`, `security_code`, `identification.number`, e quaisquer dados sensiveis de `payer`
   - logs com correlation IDs e IDs tecnicos, sem PII sensivel.

3. **Idempotencia e anti-replay**
   - impedir dupla cobranca por repeticao de submit
   - rejeitar tentativa quando compra nao estiver mais apta para novo pagamento
   - usar atualizacao condicional/transacional para evitar race em cliques simultaneos.

4. **Ownership e autorizacao forte**
   - todo acesso por `purchaseId` deve ser filtrado por `userId` autenticado
   - nunca aceitar acao sobre compra de terceiro.

5. **Rate limiting na rota de pagamento**
   - limite por usuario e IP para reduzir brute force e abuso de tentativas.

6. **Respostas seguras para o cliente**
   - mensagens amigaveis e estaveis
   - sem refletir resposta crua do MP, stack ou payload.

7. **Estados validos e transicoes restritas**
   - FSM minima: `pending -> approved|failed`
   - bloqueio de regressao de estado e mutacoes ilegais.

8. **Webhook/reconcile idempotentes**
   - consolidacao por `external_reference`
   - updates repetidos nao podem duplicar creditos/aplicacoes.

9. **Auditoria minima de eventos financeiros**
   - registrar eventos tecnicos (tentativa, resposta, aplicacao)
   - sem armazenar dados sensiveis de cartao/documento.

10. **Testes negativos de seguranca**
    - payload adulterado
    - tentativa com `purchaseId` de outro usuario
    - replay/duplo submit
    - flood basico de tentativas
    - erro MP sem vazamento ao cliente.

## Mudancas de UX no frontend

### Brick

- Em `apps/web/src/app/pagamento/checkout/[purchaseId]/page.client.tsx`:
  - manter render do Brick embedded
  - remover qualquer fallback de submit dry-run
  - mapear retorno de submit real para redirecionamento direto por `redirectTo`
  - exibir erro seguro em rejeicao/validacao sem abrir fluxo Pro automaticamente.

### Pro

- Em `apps/web/src/app/planos/paid-plan-checkout-form.tsx`:
  - preservar comportamento atual quando modo efetivo for `pro`.

### Selecao de modo no checkout

- Endpoint que inicia checkout deve retornar modo efetivo para o front (`pro` ou `brick`).
- CTA de compra respeita o modo retornado:
  - `pro` -> fluxo atual
  - `brick` -> navegar para `/pagamento/checkout/[purchaseId]`.

## Observabilidade e operacao

- Incluir eventos operacionais por etapa (sem PII sensivel):
  - checkout iniciado
  - brick mounted
  - submit iniciado
  - submit aprovado/pendente/rejeitado
  - aplicacao de compra executada
  - falhas de validacao/rate limit.
- Logs devem carregar `purchaseId`, `userId` tecnico (quando permitido internamente), `paymentReference`, `mpPaymentId` (quando existente), e `requestId`.

## Plano de testes

### API (unitario/integracao)

1. `submitBrickPayment` cria pagamento real e retorna `approved` com redirect concluido.
2. `submitBrickPayment` retorna `pending` com redirect pendente.
3. Rejeicao MP retorna `errorCode` seguro sem vazar detalhes.
4. Payload invalido retorna `brick_payload_invalid`.
5. Ownership invalida retorna 404/403 sem enumeracao.
6. Replay/duplo submit nao gera dupla cobranca.
7. Modo `pro` bloqueia submit no endpoint Brick (`brick_mode_disabled`).

### Web (UI)

1. Em modo `brick`, compra navega para `/pagamento/checkout/[purchaseId]` sem popup.
2. Submit `approved` redireciona para `/pagamento/concluido`.
3. Submit `pending` redireciona para `/pagamento/pendente`.
4. Submit `rejected` mostra erro local seguro.
5. Em modo `pro`, fluxo de popup atual segue inalterado.

### Seguranca

1. Verificar ausencia de `token` e PII sensivel em logs.
2. Verificar redaction em erros de provider.
3. Verificar rate limiting efetivo sob carga de tentativas.

## Rollout e rollback

1. Deploy com codigo dual-mode pronto.
2. Validacao inicial com `PAYMENT_CHECKOUT_MODE=pro` (comportamento atual preservado).
3. Troca controlada para `PAYMENT_CHECKOUT_MODE=brick` em ambiente alvo.
4. Se houver incidente operacional, rollback imediato via env para `pro` sem rollback de codigo.

## Criterios de aceite

1. Fluxo Brick processa pagamento real sem popup e sem nova aba.
2. `approved` imediato redireciona para concluido; `pending/in_process` para pendente.
3. Fluxo Pro continua funcional como hoje, selecionavel por `PAYMENT_CHECKOUT_MODE`.
4. As envs redundantes de Brick sao removidas do fluxo principal.
5. Nenhum dado sensivel financeiro aparece em resposta de erro ao cliente ou logs de aplicacao.
6. Testes de funcionalidade e seguranca do fluxo dual passam com evidencia.
