# Handoff: Bloqueio Mercado Pago Brick (producao/local)

## Objetivo

Validar pagamento real (R$ 11,90) via Payment Brick em ambiente local antes de promover para producao, mantendo webhook e aplicacao de compra funcionando.

## Estado atual

- Migracao incremental Brick + fallback Pro implementada.
- Endpoint de checkout Brick e submit existentes.
- Dry-run validado.
- Para teste real: `PAYMENT_BRICK_DRY_RUN=false`.

## Sintoma

- Na rota `/pagamento/checkout/[purchaseId]`, o Brick pisca e cai antes da selecao do meio de pagamento.
- Requisicao de inicializacao do Brick retorna 400.

## Evidencias

- Request:
  - `GET https://api.mercadopago.com/bricks/payment_brick/initialization?public_key=APP_USR-bab10a23-af4d-4462-8f95-e794bb95b1c3&product_id=CHQBURHMDARLP9CT19E0&amount=29.9`
- Response:
  - `400 Bad Request`
  - `{"code":"bad_request","message":"No payment type was selected"}`
- `x-request-id` reportado: `148e9b6e-868a-4d07-87bb-f18b3401e1e3`

## Configuracao ja aplicada

- Nova aplicacao no Mercado Pago criada para Brick.
- Credenciais trocadas e servidores reiniciados:
  - `MERCADOPAGO_ACCESS_TOKEN`
  - `MERCADOPAGO_WEBHOOK_SECRET`
  - `NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY`
- Variaveis locais no teste real:
  - `PAYMENT_PROVIDER=mercadopago`
  - `PAYMENT_CHECKOUT_MODE=brick`
  - `PAYMENT_BRICK_ENABLED=true`
  - `PAYMENT_BRICK_DRY_RUN=false`
  - `NEXT_PUBLIC_PAYMENT_BRICK_LOCAL_DEGRADED=false`
  - allowlist ativa para usuario de teste

## Diagnostico atual

Hipotese principal: bloqueio de habilitacao/elegibilidade no lado Mercado Pago para Payment Brick em producao (meios Pix/cartao nao elegiveis para a app/conta), e nao erro de regra de negocio do app.

## Interacao com suporte Mercado Pago

- Solicitacao enviada pedindo confirmacao de:
  1. Habilitacao efetiva de Payment Brick em producao para a app.
  2. Habilitacao de Pix e cartao no Brick.
  3. Pendencias de onboarding/compliance/KYC.
- Resposta inicial foi generica, citando `payment_type`.
- Reforco tecnico enviado: no init do Brick, a chamada e feita pelo SDK e o integrador nao injeta `payment_type` manualmente nesse GET.

## Proximos passos quando o MP responder

1. Se confirmarem habilitacao aplicada:
   - Repetir teste real no Brick.
   - Validar que `initialization` retorna 200.
   - Validar selecao Pix/cartao, pagamento aprovado, webhook recebido e `pending -> approved`.
2. Se apontarem pendencia:
   - Resolver pendencia indicada e repetir validacao.
3. Se insistirem em parametro tecnico:
   - Pedir campo/metodo/callback exato no SDK onde o parametro seria obrigatorio.

## Melhoria tecnica pendente no frontend

Independente do retorno do MP, ajustar `apps/web/src/app/pagamento/checkout/[purchaseId]/page.client.tsx` para nao cair automaticamente em fallback dry-run quando `PAYMENT_BRICK_DRY_RUN=false`, exibindo erro estavel para depuracao.

## Arquivos chave para retomada

- `apps/web/src/app/pagamento/checkout/[purchaseId]/page.client.tsx`
- `apps/web/next.config.ts`
- `apps/api/src/payments/payments.service.ts`
- `apps/api/src/plans/plans.service.ts`
- `.env`

---

## Revisao de codigo (2026-05-09)

### O que esta correto no nosso lado

- Rota de proxy Next.js (`/api/payments/brick/checkout/[purchaseId]` e `.../pay`) — correta, propaga auth e repassa status code integralmente.
- `getBrickCheckoutData` — guards corretos: valida status, amount, origem, elegibilidade por allowlist/flags antes de retornar dados ao frontend.
- Inicializacao do Brick no frontend: `amount`, `locale: "pt-BR"`, callbacks `onReady`/`onSubmit`/`onError`, carga assincrona do SDK — todos corretos.
- `evaluateBrickEligibility` — allowlist por userId e email, flags de modo/enabled, sem risco de vazamento.

### Confirmado: o erro `"No payment type was selected"` e do lado do MP

O SDK do Brick faz internamente, no momento da montagem:

```
GET api.mercadopago.com/bricks/payment_brick/initialization?public_key=...&amount=...
```

Esse endpoint retorna os meios de pagamento disponiveis (Pix, cartao) para aquela aplicacao/conta. O `400 "No payment type was selected"` indica que o MP nao encontrou nenhum meio habilitado para a `public_key` em uso. O integrador **nao injeta** `payment_type` nessa chamada — ela e feita automaticamente pelo SDK. O chamado ao suporte e necessario e o diagnostico no handoff esta correto.

### Gap critico identificado: fluxo real de pagamento nao implementado

`submitBrickPayment` em `apps/api/src/payments/payments.service.ts` e um stub. Quando `PAYMENT_BRICK_DRY_RUN=false`, retorna erro 400:

```ts
if (!dryRunEnabled) {
  throw new BadRequestException(
    "Real payment flow not implemented yet. Enable PAYMENT_BRICK_DRY_RUN=true.",
  );
}
```

O fluxo real que precisa ser implementado nessa funcao:
1. Extrair e validar os campos do `formData` do Brick (`token`, `payment_method_id`, `installments`, `payer`, etc.)
2. Chamar `POST /v1/payments` no MP com token + `transaction_amount` + `external_reference` do purchase
3. Persistir `mpPaymentId` e `status` no `planPurchase`
4. Se `approved` → chamar `plansService.applyApprovedPurchase` diretamente
5. Se `pending` ou `in_process` → aguardar confirmacao via webhook existente
6. Se `rejected` → retornar erro ao frontend com motivo legivel

### Gap menor: fallback dry-run exposto quando `DRY_RUN=false`

O `onError` do Brick com `"No payment type was selected"` chama `setShowDryRunFallback(true)` independente do valor de `PAYMENT_BRICK_DRY_RUN`. Com `DRY_RUN=false`, o botao de dry-run aparece e o clique retorna 400. E o mesmo ponto ja identificado na secao "Melhoria tecnica pendente".

---

## Proximos passos completos (ordem de execucao)

### Bloqueado por MP (aguardar resposta do suporte)

1. Confirmar habilitacao de Payment Brick em producao para a app.
2. Confirmar habilitacao de Pix e cartao na conta/app.
3. Resolver pendencias de onboarding/KYC se apontadas.
4. Repetir teste: montar Brick, verificar `initialization` retorna 200 e metodos aparecem.

### Independente do MP (pode implementar agora)

5. **Corrigir fallback seco no frontend**: quando `PAYMENT_BRICK_DRY_RUN=false`, o `onError` com `"No payment type was selected"` deve exibir mensagem de erro clara e nao mostrar botao de dry-run.

### Apos MP confirmar habilitacao

6. **Implementar `submitBrickPayment` real** em `payments.service.ts`:
   - Validar campos obrigatorios do `formData` do Brick.
   - Criar pagamento via `Payment.create` do SDK do MP com `transaction_amount`, `token`, `payment_method_id`, `installments`, `payer`, `external_reference` (= `purchase.paymentReference`).
   - Persistir `mpPaymentId` e novo status no `planPurchase`.
   - Se `approved`: chamar `plansService.applyApprovedPurchase`.
   - Retornar status ao frontend para redirecionar para `/pagamento/concluido` ou `/pagamento/pendente`.
7. **Validar webhook end-to-end**: pagamento criado via Brick deve ser reconciliado corretamente pelo webhook ja existente (usar `external_reference` como chave de correlacao).
8. **Teste real completo**: Pix aprovado → webhook recebido → status `pending → approved` → creditos concedidos.
9. Remover flags `PAYMENT_BRICK_DRY_RUN` e o codigo de dry-run apos validacao em producao.
