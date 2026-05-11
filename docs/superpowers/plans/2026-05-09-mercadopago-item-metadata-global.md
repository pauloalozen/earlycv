# Mercado Pago Item Metadata Global Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Incluir `items.category_id` e `items.description` em todas as preferencias Mercado Pago dos fluxos atuais (planos + unlock CV), mantendo comportamento de checkout intacto.

**Architecture:** Reaproveitar o modulo compartilhado em `apps/api/src/payments` para centralizar metadados de item de preferencia MP. Integrar esse builder nos dois services que criam preferencias para evitar divergencia futura. Validar por testes focados de service e helper.

**Tech Stack:** NestJS, TypeScript, Mercado Pago SDK, Node test runner (`node:test`), `tsx --test`.

---

## File structure map

- Modify: `apps/api/src/payments/mercado-pago-return-config.ts`
  - Adicionar builder de metadados de item MP (ou helper sibling no mesmo modulo) para uso comum.
- Modify: `apps/api/src/payments/mercado-pago-return-config.spec.ts`
  - Cobrir metadados globais de item e contratos do helper.
- Modify: `apps/api/src/cv-adaptation/cv-adaptation-payment.service.ts`
  - Aplicar metadados no item do checkout de unlock CV.
- Modify: `apps/api/src/cv-adaptation/cv-adaptation-payment.service.spec.ts`
  - Verificar `items[0].category_id` e `items[0].description` no payload.
- Modify: `apps/api/src/plans/plans.service.ts`
  - Aplicar metadados no item do checkout de planos.
- Modify: `apps/api/src/plans/plans.service.spec.ts`
  - Verificar `items[0].category_id` e `items[0].description` no payload.

### Task 1: Criar builder compartilhado para metadados de item (TDD)

**Files:**
- Modify: `apps/api/src/payments/mercado-pago-return-config.spec.ts`
- Modify: `apps/api/src/payments/mercado-pago-return-config.ts`

- [ ] **Step 1: Escrever teste falhando para metadados de `cv_adaptation`**

```ts
test("buildMercadoPagoItemMetadata returns category_id and description for cv_adaptation", () => {
  const result = buildMercadoPagoItemMetadata({ flow: "cv_adaptation" });
  assert.equal(typeof result.category_id, "string");
  assert.equal(result.category_id.length > 0, true);
  assert.match(result.description, /CV|curriculo|EarlyCV/i);
});
```

- [ ] **Step 2: Escrever teste falhando para metadados de `plan_purchase`**

```ts
test("buildMercadoPagoItemMetadata returns category_id and description for plan_purchase", () => {
  const result = buildMercadoPagoItemMetadata({
    flow: "plan_purchase",
    planLabel: "Pro",
  });
  assert.equal(typeof result.category_id, "string");
  assert.equal(result.category_id.length > 0, true);
  assert.match(result.description, /Plano Pro|creditos|EarlyCV/i);
});
```

- [ ] **Step 3: Rodar teste focado e validar falha**

Run: `npm run test --workspace apps/api -- src/payments/mercado-pago-return-config.spec.ts`
Expected: FAIL por funcao ainda nao implementada.

- [ ] **Step 4: Implementar builder compartilhado minimo**

```ts
export function buildMercadoPagoItemMetadata(input: {
  flow: "cv_adaptation" | "plan_purchase";
  planLabel?: string;
}): { category_id: string; description: string } {
  const category_id = "services";
  if (input.flow === "cv_adaptation") {
    return {
      category_id,
      description: "Liberacao de CV adaptado no EarlyCV",
    };
  }
  const label = input.planLabel?.trim() || "Plano";
  return {
    category_id,
    description: `Compra de creditos no EarlyCV - ${label}`,
  };
}
```

- [ ] **Step 5: Rodar teste focado e validar sucesso**

Run: `npm run test --workspace apps/api -- src/payments/mercado-pago-return-config.spec.ts`
Expected: PASS.

- [ ] **Step 6: Commit da task**

```bash
git add apps/api/src/payments/mercado-pago-return-config.ts apps/api/src/payments/mercado-pago-return-config.spec.ts
git commit -m "feat(payments): add shared MP item metadata builder"
```

### Task 2: Aplicar metadados de item no checkout de unlock CV (TDD)

**Files:**
- Modify: `apps/api/src/cv-adaptation/cv-adaptation-payment.service.spec.ts`
- Modify: `apps/api/src/cv-adaptation/cv-adaptation-payment.service.ts`

- [ ] **Step 1: Escrever teste falhando para payload de item no CV adaptation**

```ts
assert.equal(capturedBody?.items?.[0]?.category_id, "services");
assert.match(String(capturedBody?.items?.[0]?.description), /CV|EarlyCV/i);
```

- [ ] **Step 2: Rodar teste focado e validar falha**

Run: `npm run test --workspace apps/api -- src/cv-adaptation/cv-adaptation-payment.service.spec.ts`
Expected: FAIL por campos ausentes no item.

- [ ] **Step 3: Implementar merge do metadata no item de preferencia**

```ts
const itemMetadata = buildMercadoPagoItemMetadata({ flow: "cv_adaptation" });
items: [
  {
    id: adaptationId,
    title: "CV Adaptado - EarlyCV",
    quantity: 1,
    unit_price: priceInReais,
    currency_id: "BRL",
    ...itemMetadata,
  },
],
```

- [ ] **Step 4: Rodar teste focado e validar sucesso**

Run: `npm run test --workspace apps/api -- src/cv-adaptation/cv-adaptation-payment.service.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit da task**

```bash
git add apps/api/src/cv-adaptation/cv-adaptation-payment.service.ts apps/api/src/cv-adaptation/cv-adaptation-payment.service.spec.ts
git commit -m "feat(cv-adaptation): include MP item metadata in preference"
```

### Task 3: Aplicar metadados de item no checkout de planos (TDD)

**Files:**
- Modify: `apps/api/src/plans/plans.service.spec.ts`
- Modify: `apps/api/src/plans/plans.service.ts`

- [ ] **Step 1: Escrever teste falhando para payload de item em planos**

```ts
assert.equal(capturedBody?.items?.[0]?.category_id, "services");
assert.match(String(capturedBody?.items?.[0]?.description), /EarlyCV|Plano/i);
```

- [ ] **Step 2: Rodar teste focado e validar falha**

Run: `npm run test --workspace apps/api -- src/plans/plans.service.spec.ts`
Expected: FAIL por campos ausentes no item.

- [ ] **Step 3: Implementar merge do metadata no item de preferencia**

```ts
const itemMetadata = buildMercadoPagoItemMetadata({
  flow: "plan_purchase",
  planLabel: plan.label,
});

items: [
  {
    id: purchaseId,
    title: plan.label,
    quantity: 1,
    unit_price: plan.amountInCents / 100,
    currency_id: "BRL",
    ...itemMetadata,
  },
],
```

- [ ] **Step 4: Rodar teste focado e validar sucesso**

Run: `npm run test --workspace apps/api -- src/plans/plans.service.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit da task**

```bash
git add apps/api/src/plans/plans.service.ts apps/api/src/plans/plans.service.spec.ts
git commit -m "feat(plans): include MP item metadata in preference"
```

### Task 4: Verificacao final de regressao no escopo

**Files:**
- Modify: none

- [ ] **Step 1: Rodar suites focadas do ajuste**

Run: `npm run test --workspace apps/api -- src/payments/mercado-pago-return-config.spec.ts src/cv-adaptation/cv-adaptation-payment.service.spec.ts src/plans/plans.service.spec.ts`
Expected: PASS.

- [ ] **Step 2: Rodar sanity dos specs relacionados de cv-adaptation**

Run: `npm run test --workspace apps/api -- src/cv-adaptation/cv-adaptation.service.spec.ts`
Expected: PASS.

- [ ] **Step 3: Checklist de escopo (sem alteracao de codigo)**

Confirmar:
- webhook inalterado
- frontend/telas inalterados
- regras de credito e unlock inalteradas
- sem mudancas de Prisma/migrations

- [ ] **Step 4: Commit final (se houver ajuste residual)**

```bash
git add apps/api/src/payments apps/api/src/plans apps/api/src/cv-adaptation
git commit -m "test(api): cover MP item metadata for all checkout preferences"
```

## Self-review

- Cobertura da spec: completa (helper compartilhado + integracao nos 2 fluxos + testes).
- Sem placeholders/TODO.
- Assinaturas e nomes consistentes (`buildMercadoPagoItemMetadata`, `flow`, `planLabel`).
