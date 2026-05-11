# Mercado Pago Auto-Return Global Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Padronizar `back_urls` e `auto_return` do Mercado Pago em todos os fluxos de criacao de preferencia no backend, sem alterar fluxo funcional de pagamento.

**Architecture:** Introduzir um helper compartilhado em `apps/api/src/payments` para construir configuracao de retorno MP (URLs + `auto_return` condicional + flags de diagnostico). Reusar esse helper em `cv-adaptation-payment.service.ts` e `plans.service.ts`, mantendo as mesmas rotas/query params atuais. Cobrir o helper com testes unitarios e ajustar testes de service que validam criacao de preferencia.

**Tech Stack:** NestJS, TypeScript, Node test runner (`node:test`), Mercado Pago SDK.

---

## File structure map

- Create: `apps/api/src/payments/mercado-pago-return-config.ts`
  - Responsabilidade: montar `back_urls` e `auto_return` de forma deterministica, sem side effects.
- Create: `apps/api/src/payments/mercado-pago-return-config.spec.ts`
  - Responsabilidade: validar regras do helper (HTTPS vs nao-HTTPS, paths, query preservation).
- Modify: `apps/api/src/cv-adaptation/cv-adaptation-payment.service.ts`
  - Responsabilidade: substituir montagem inline por helper + logs de diagnostico nao sensiveis.
- Modify: `apps/api/src/plans/plans.service.ts`
  - Responsabilidade: substituir montagem inline por helper + logs de diagnostico nao sensiveis.
- Modify: `apps/api/src/plans/plans.service.spec.ts`
  - Responsabilidade: garantir cobertura de uso do helper no fluxo de preferencia de planos (sem alterar comportamento fora de escopo).

### Task 1: Criar helper compartilhado de retorno MP (TDD)

**Files:**
- Create: `apps/api/src/payments/mercado-pago-return-config.spec.ts`
- Create: `apps/api/src/payments/mercado-pago-return-config.ts`

- [ ] **Step 1: Escrever teste falhando para sucesso em HTTPS com auto_return**

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { buildMercadoPagoReturnConfig } from "./mercado-pago-return-config";

test("buildMercadoPagoReturnConfig enables auto_return for https success url", () => {
  const result = buildMercadoPagoReturnConfig({
    frontendUrl: "https://earlycv.com.br",
    successPath: "/pagamento/concluido?checkoutId=abc",
    failurePath: "/pagamento/falhou?checkoutId=abc",
    pendingPath: "/pagamento/pendente?checkoutId=abc",
  });

  assert.deepEqual(result.backUrls, {
    success: "https://earlycv.com.br/pagamento/concluido?checkoutId=abc",
    failure: "https://earlycv.com.br/pagamento/falhou?checkoutId=abc",
    pending: "https://earlycv.com.br/pagamento/pendente?checkoutId=abc",
  });
  assert.equal(result.autoReturn, "approved");
  assert.equal(result.successUrlIsHttps, true);
  assert.equal(result.autoReturnEnabled, true);
});
```

- [ ] **Step 2: Rodar teste e confirmar falha inicial**

Run: `npm run test --workspace apps/api -- mercado-pago-return-config.spec.ts`
Expected: FAIL por modulo/funcao inexistente.

- [ ] **Step 3: Implementar helper minimo**

```ts
export type MercadoPagoReturnConfigInput = {
  frontendUrl: string;
  successPath: string;
  failurePath: string;
  pendingPath: string;
};

export type MercadoPagoReturnConfig = {
  backUrls: {
    success: string;
    failure: string;
    pending: string;
  };
  autoReturn?: "approved";
  successUrlIsHttps: boolean;
  autoReturnEnabled: boolean;
  frontendHost: string;
};

export function buildMercadoPagoReturnConfig(
  input: MercadoPagoReturnConfigInput,
): MercadoPagoReturnConfig {
  const base = new URL(input.frontendUrl);
  const success = new URL(input.successPath, base).toString();
  const failure = new URL(input.failurePath, base).toString();
  const pending = new URL(input.pendingPath, base).toString();

  const successUrlIsHttps = success.startsWith("https://");

  return {
    backUrls: { success, failure, pending },
    ...(successUrlIsHttps ? { autoReturn: "approved" as const } : {}),
    successUrlIsHttps,
    autoReturnEnabled: successUrlIsHttps,
    frontendHost: base.host,
  };
}
```

- [ ] **Step 4: Adicionar cenarios complementares de teste**

```ts
test("buildMercadoPagoReturnConfig keeps back_urls and disables auto_return on non-https", () => {
  const result = buildMercadoPagoReturnConfig({
    frontendUrl: "http://localhost:3000",
    successPath: "/pagamento/concluido?checkoutId=abc",
    failurePath: "/pagamento/falhou?checkoutId=abc",
    pendingPath: "/pagamento/pendente?checkoutId=abc",
  });

  assert.equal(result.backUrls.success, "http://localhost:3000/pagamento/concluido?checkoutId=abc");
  assert.equal(result.autoReturn, undefined);
  assert.equal(result.successUrlIsHttps, false);
  assert.equal(result.autoReturnEnabled, false);
});
```

- [ ] **Step 5: Rodar testes do helper**

Run: `npm run test --workspace apps/api -- mercado-pago-return-config.spec.ts`
Expected: PASS.

- [ ] **Step 6: Commit da task**

```bash
git add apps/api/src/payments/mercado-pago-return-config.ts apps/api/src/payments/mercado-pago-return-config.spec.ts
git commit -m "test(payments): add shared MP return config builder"
```

### Task 2: Integrar helper no fluxo de cv-adaptation (TDD)

**Files:**
- Modify: `apps/api/src/cv-adaptation/cv-adaptation-payment.service.ts`
- Test: `apps/api/src/cv-adaptation/cv-adaptation.service.spec.ts` (ou novo spec de payment service se preferir melhor isolamento)

- [ ] **Step 1: Escrever teste falhando validando payload de preferencia com back_urls/auto_return**

```ts
test("createIntent builds MP preference using shared return config", async () => {
  // mock de Preference.create capturando body
  // assert body.back_urls.success/failure/pending
  // assert auto_return presente em frontend https
});
```

- [ ] **Step 2: Rodar teste e confirmar falha**

Run: `npm run test --workspace apps/api -- cv-adaptation`
Expected: FAIL por asserts do payload nao atendidos.

- [ ] **Step 3: Substituir montagem inline pelo helper e adicionar logs**

```ts
const frontendUrl = process.env.FRONTEND_URL ?? "http://localhost:3000";
const returnConfig = buildMercadoPagoReturnConfig({
  frontendUrl,
  successPath: `/pagamento/concluido?checkoutId=${adaptationId}`,
  failurePath: `/pagamento/falhou?checkoutId=${adaptationId}`,
  pendingPath: `/pagamento/pendente?checkoutId=${adaptationId}`,
});

if (!returnConfig.successUrlIsHttps) {
  this.logger.warn(
    `[mp:return-config] flow=cv_adaptation adaptationId=${adaptationId} frontendHost=${returnConfig.frontendHost} autoReturnEnabled=false`,
  );
}

const preferenceBody = {
  // ... itens atuais
  back_urls: returnConfig.backUrls,
  ...(returnConfig.autoReturn ? { auto_return: returnConfig.autoReturn } : {}),
};
```

- [ ] **Step 4: Rodar testes de cv-adaptation**

Run: `npm run test --workspace apps/api -- cv-adaptation`
Expected: PASS.

- [ ] **Step 5: Commit da task**

```bash
git add apps/api/src/cv-adaptation/cv-adaptation-payment.service.ts apps/api/src/cv-adaptation/cv-adaptation.service.spec.ts
git commit -m "feat(cv-adaptation): standardize MP auto-return config"
```

### Task 3: Integrar helper no fluxo de planos (TDD)

**Files:**
- Modify: `apps/api/src/plans/plans.service.ts`
- Modify: `apps/api/src/plans/plans.service.spec.ts`

- [ ] **Step 1: Escrever teste falhando cobrindo preferencia de planos com helper**

```ts
test("createMercadoPagoPreference uses shared return config and preserves checkoutId query", async () => {
  // mock de Preference.create e captura de body
  // assert back_urls com checkoutId
  // assert auto_return em frontend https
});

test("createMercadoPagoPreference logs warning and skips auto_return on non-https", async () => {
  // FRONTEND_URL=http://localhost:3000
  // assert auto_return undefined
  // assert warn chamado
});
```

- [ ] **Step 2: Rodar testes de planos e confirmar falha inicial**

Run: `npm run test --workspace apps/api -- plans.service.spec.ts`
Expected: FAIL pelos novos asserts.

- [ ] **Step 3: Implementar integracao no service de planos**

```ts
const returnConfig = buildMercadoPagoReturnConfig({
  frontendUrl,
  successPath: `/pagamento/concluido?checkoutId=${purchaseId}`,
  failurePath: `/pagamento/falhou?checkoutId=${purchaseId}`,
  pendingPath: `/pagamento/pendente?checkoutId=${purchaseId}`,
});

if (!returnConfig.successUrlIsHttps) {
  this.logger.warn(
    `[mp:return-config] flow=plan_purchase purchaseId=${purchaseId} frontendHost=${returnConfig.frontendHost} autoReturnEnabled=false`,
  );
}

// no payload:
back_urls: returnConfig.backUrls,
...(returnConfig.autoReturn ? { auto_return: returnConfig.autoReturn } : {}),
```

- [ ] **Step 4: Rodar testes de planos**

Run: `npm run test --workspace apps/api -- plans.service.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit da task**

```bash
git add apps/api/src/plans/plans.service.ts apps/api/src/plans/plans.service.spec.ts
git commit -m "feat(plans): reuse shared MP return configuration"
```

### Task 4: Verificacao final de regressao no escopo permitido

**Files:**
- Modify: none (somente verificacao)

- [ ] **Step 1: Executar bateria de testes focados**

Run: `npm run test --workspace apps/api -- payments plans cv-adaptation`
Expected: PASS sem alterar componentes fora de escopo.

- [ ] **Step 2: Verificacao manual de nao-escopo**

Checklist (sem codigo):
- webhook inalterado
- regras de credito/desbloqueio inalteradas
- frontend e rotas de telas inalterados
- sem mudancas de Prisma/migrations

- [ ] **Step 3: Commit final (se houver ajustes de teste)**

```bash
git add apps/api/src/payments apps/api/src/plans apps/api/src/cv-adaptation
git commit -m "test(api): cover MP auto-return config across checkout flows"
```

## Spec coverage self-check

- Cobertura completa do objetivo: sim (helper compartilhado + integracao em `cv-adaptation` e `plans`).
- Escopo permitido: respeitado (backend + testes).
- Fora de escopo absoluto: sem tasks de alteracao em webhook/frontend/UX/DB.
- Requisito de log de alerta e seguir: coberto nas Tasks 2 e 3.
