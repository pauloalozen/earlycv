# Runbook: Ativacao do Mercado Pago Brick em producao

## Escopo

Este checklist cobre deploy seguro da migration e ativacao do modo Brick usando `PAYMENT_CHECKOUT_MODE`, mantendo rollback rapido para Checkout Pro.

## Pre-deploy

- [ ] Migration Prisma criada para enum `PaymentStatus` com `processing_payment` e `pending_payment`.
- [ ] `npm run generate --workspace @earlycv/database` executado com sucesso.
- [ ] Testes API executados:
  - `npm test -- src/payments/brick-payload.spec.ts src/payments/payments.service.spec.ts src/plans/plans.service.spec.ts`
- [ ] Testes Web executados:
  - `npm run test:ui -- "src/app/pagamento/checkout/[purchaseId]/page.client.test.tsx" "src/app/pagamento/pendente/page.test.tsx" "src/app/planos/page.test.tsx"`
- [ ] Build executado:
  - `npm run build --workspace @earlycv/api`
  - `npm run build --workspace @earlycv/web`
- [ ] Env Railway/API revisadas:
  - `PAYMENT_CHECKOUT_MODE=pro` (manter neste momento)
  - `MERCADOPAGO_PRO_ACCESS_TOKEN`
  - `MERCADOPAGO_BRICK_ACCESS_TOKEN`
  - fallback legado `MERCADOPAGO_ACCESS_TOKEN` preservado
- [ ] Env Vercel/Web revisadas:
  - `NEXT_PUBLIC_MERCADOPAGO_BRICK_PUBLIC_KEY`
  - fallback legado `NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY` preservado
- [ ] Webhook Mercado Pago apontando para API correta.

## Deploy

- [ ] Aplicar migration no banco de producao (via pipeline/deploy que execute `prisma migrate deploy`).
- [ ] Deploy API.
- [ ] Deploy Web.
- [ ] Confirmar `PAYMENT_CHECKOUT_MODE=pro` apos deploy.
- [ ] Validar Checkout Pro ponta-a-ponta ainda funcional.

## Ativacao do Brick

- [ ] Alterar `PAYMENT_CHECKOUT_MODE=brick`.
- [ ] Criar compra real de menor valor.
- [ ] Validar `PlanPurchase` com transicoes:
  - `pending -> processing_payment -> (completed | pending_payment | pending)`
- [ ] Validar persistencia de `mpPaymentId`.
- [ ] Validar eventos em `PaymentAuditLog` (sem dados sensiveis).
- [ ] Validar aplicacao de credito/desbloqueio em `approved`.
- [ ] Validar webhook recebido e reconciliacao.
- [ ] Validar nao duplicacao de creditos.
- [ ] Validar caso Pix `pending/in_process` encaminhando para `/pagamento/pendente`.

## Rollback

- [ ] Voltar `PAYMENT_CHECKOUT_MODE=pro`.
- [ ] Confirmar novos checkouts voltam para fluxo Pro.
- [ ] Confirmar webhooks de pagamentos Brick ja criados continuam reconciliando.
- [ ] Monitorar compras em `processing_payment`/`pending_payment` ate convergirem por webhook/reconcile.
