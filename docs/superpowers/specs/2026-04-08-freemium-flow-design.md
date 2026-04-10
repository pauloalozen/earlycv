# Spec: Fluxo Freemium — Cadastro, Planos e Monetização

**Data:** 2026-04-08  
**Status:** aprovada, pronta para implementação  
**Escopo:** evoluir o fluxo existente de análise de CV para suportar freemium + cadastro + planos pagos.

---

## 0. Premissas e restrições absolutas

- **NÃO recriar** landing page (`/`), tela de upload (`/adaptar`) ou tela de resultado (`/adaptar/resultado`).
- **NÃO alterar** identidade visual estabelecida: paleta, tipografia, espaçamentos, componentes funcionando.
- **NÃO alterar** a tela de login existente em `/login` — ela serve admin/staff. Criar nova rota.
- Reutilizar: `analyzeGuestCv`, `apiRequest`, `getCurrentAppUserFromCookies`, `getRouteAccessRedirectPath`, pagamento Mercado Pago.
- Toda nova tela segue a identidade visual das páginas de usuário: fundo `#FAFAFA`, cards `bg-white shadow-sm rounded-xl`, botão primário `bg-[#111111]`.

---

## 1. Visão geral do fluxo

```
[/adaptar] → análise guest → sessionStorage
     ↓
[/adaptar/resultado] — teaser (sem login)
     ↓
CTA "Crie sua conta" → [/entrar?next=/adaptar/resultado]
     ↓
login/cadastro → análise persistida → redirect back
     ↓
[/adaptar/resultado] — completo (com login)
     ↓
CTA "Baixar CV otimizado" → [/planos]
     ↓
seleção de plano → checkout Mercado Pago
     ↓
[/dashboard] — painel do usuário
```

---

## 2. Ajustes na tela de resultado (`/adaptar/resultado`)

### 2.1 Lógica de estado: guest vs. autenticado

A página já recebe dados do `sessionStorage`. Adicionar leitura do usuário autenticado para determinar o modo de exibição:

```ts
// Pseudocódigo — executar no client via server action
const user = await getCurrentAppUserFromCookies()
const isAuthenticated = Boolean(user)
```

Em client component, usar um server action (já existe o padrão) para retornar `{ isAuthenticated: boolean }` e armazenar no estado local.

### 2.2 Correção da contagem de itens bloqueados

**Problema atual:** `LockedList` mostra sempre 1 item + blur de 2 mocks, ignorando o real número de itens da lista.

**Correção:**
```ts
// Antes (errado)
const visible = items.slice(0, 1)
const lockedCount = Math.max(0, items.length - 1)

// Correto: lockedCount = quantos itens reais estão bloqueados, não mocks
const visibleCount = isAuthenticated ? items.length : 1
const visible = items.slice(0, visibleCount)
const lockedCount = Math.max(0, items.length - visibleCount)
```

O badge de bloqueio deve mostrar o número real: `+{lockedCount} itens bloqueados`.

### 2.3 Modo teaser (guest — sem login)

Adicionar bloco de conversão para cadastro **dentro de cada card de diagnóstico** quando `!isAuthenticated`:

```tsx
// Abaixo do LockedList em cada card (pontos_fortes, lacunas, melhorias_aplicadas)
{!isAuthenticated && lockedCount > 0 && (
  <p className="mt-2 text-[11px] text-[#AAAAAA]">
    🔒 Crie uma conta para ver a análise completa
  </p>
)}
```

**Banner no topo da página** (apenas quando guest):
```tsx
<div className="rounded-xl bg-[#111111] px-5 py-4 flex items-center justify-between gap-4">
  <p className="text-sm font-medium text-white">
    Crie uma conta para ver a análise completa
  </p>
  <a
    href={`/entrar?next=/adaptar/resultado`}
    className="shrink-0 rounded-[10px] bg-white px-4 py-2 text-sm font-bold text-[#111111]"
  >
    Criar conta grátis
  </a>
</div>
```

**CTA principal** (botão existente na seção de conversão): alterar texto e destino quando guest:
```tsx
// guest
href="/entrar?next=/adaptar/resultado"
text="Criar conta para ver análise completa"

// autenticado (comportamento atual)
onClick → /planos
text="Baixar meu CV otimizado — R$19,90"
```

### 2.4 Modo completo (autenticado)

Quando `isAuthenticated`:
- `LockedList` exibe todos os itens sem blur nem badge de bloqueio
- Banner de desbloqueio no topo:

```tsx
<div className="flex items-center gap-2 rounded-xl border border-lime-200 bg-lime-50 px-5 py-3">
  <span className="text-lime-600">✔</span>
  <p className="text-sm font-semibold text-lime-800">Análise completa desbloqueada</p>
</div>
```

- ATS keywords: todas visíveis (sem truncamento)
- Preview "Depois": sem blur

### 2.5 Linha de urgência no bloco de conversão

Adicionar acima da lista de benefícios no CTA escuro:

```tsx
<p className="mb-4 rounded-lg bg-white/10 px-4 py-2 text-sm text-white/80 italic">
  "Candidatos que aplicam nas primeiras 48h têm até 3× mais chances de resposta"
</p>
```

### 2.6 Handoff da análise após login

Quando o usuário faz login e retorna para `/adaptar/resultado`, a análise ainda está no `sessionStorage`. Neste momento, persistir a análise na API para associar ao usuário (best-effort, não bloqueia a UX):

```ts
// No useEffect do resultado, quando isAuthenticated e sessionStorage tem dados
if (isAuthenticated && stored) {
  persistGuestAnalysis(stored) // server action, fire-and-forget
}
```

**Novo server action** `persistGuestAnalysis(rawJson: string): Promise<void>`:
- Chama `POST /cv-adaptation/guest-persist` com o JSON bruto
- Endpoint cria um registro `CvAdaptation` vinculado ao userId
- Não retorna erro para o cliente se falhar

---

## 3. Nova tela de cadastro/login do usuário (`/entrar`)

**Rota:** `/entrar` (separada de `/login` que é admin)

### 3.1 Estrutura da página

Página server component, sem sidebar. Layout centralizado.

```
[Header mínimo: logo earlyCV]

[Card central, max-w-md]
  Heading: "Crie sua conta para desbloquear sua análise"
  Sub: "Grátis. Sem cartão de crédito."

  [Tabs: Criar conta | Entrar]

  [Form: nome (só cadastro) | email | senha]
  [Botão primário]

  [Separador "ou"]

  [Botão Google OAuth] — se configurado
```

**Não incluir:** marketing, features, logos secundários. Foco total na ação.

### 3.2 Comportamento do `?next`

- A página recebe `?next=/adaptar/resultado` (ou outra rota)
- Após auth bem-sucedida, redirecionar para `next` (validado — apenas paths internos `/...`)
- Se `next` ausente: redirecionar para `/dashboard`

### 3.3 Validação de next

```ts
function sanitizeNext(next: string | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) {
    return "/dashboard"
  }
  return next
}
```

### 3.4 Reuso de backend

- `POST /auth/register` e `POST /auth/login` já existem e funcionam.
- O formulário submete para esses endpoints (mesmo padrão do `/login` atual).
- Após login, o cookie é setado e o `next` redireciona via `Location` header ou JS.

---

## 4. Tela de planos (`/planos`)

### 4.1 Estrutura

Página server component, acessível sem login (redireciona para `/entrar?next=/planos` se guest clicar em "Selecionar").

```
[Header: logo + link "Voltar" se vier do resultado]

[Heading: "Escolha seu plano"]
[Sub: "Cancele quando quiser. Acesso imediato após pagamento."]

[Grid 3 colunas (md), 1 coluna (mobile)]
  [Card Plano 1]
  [Card Plano 2 — destacado]
  [Card Plano 3]
```

### 4.2 Definição dos planos

| ID interno  | Label                      | Preço      | Créditos | Destaque |
|-------------|----------------------------|------------|----------|----------|
| `starter`   | 1 CV otimizado             | R$19,90    | 1        | —        |
| `pro`       | 5 CVs otimizados           | R$39,90    | 5        | ✓        |
| `unlimited` | Uso ilimitado por 30 dias  | R$99,90    | ∞        | —        |

### 4.3 Estrutura de cada card

```tsx
<div className="rounded-xl bg-white shadow-sm p-6 space-y-4 [destaque: ring-2 ring-[#111111]]">
  {isPro && (
    <span className="rounded-full bg-[#111111] px-3 py-1 text-[11px] font-bold text-white">
      Mais escolhido
    </span>
  )}
  <p className="text-2xl font-bold text-[#111111]">{preco}</p>
  <p className="text-base font-medium text-[#111111]">{label}</p>
  <p className="text-sm text-[#666666]">{descricao}</p>
  <button className="w-full rounded-[14px] bg-[#111111] py-4 text-base font-medium text-white">
    Selecionar plano
  </button>
</div>
```

### 4.4 Ação dos botões

- Guest → `href="/entrar?next=/planos"`
- Autenticado → `POST /plans/checkout` com `{ planId: "starter" | "pro" | "unlimited" }` → retorna `{ checkoutUrl }` → redirect externo

---

## 5. Dashboard (`/dashboard`)

Substituir o placeholder atual por conteúdo real.

### 5.1 Estrutura

```
[Header: logo + "Sair"]

[Seção: Plano atual]
  - Nome do plano
  - Créditos restantes (se starter/pro) ou "Ilimitado até DD/MM"
  - Botão: "Upgrade de plano" → /planos

[Seção: Histórico de análises]
  - Lista de CvAdaptation do usuário (vaga + empresa + data + status)
  - Cada item: link para /adaptar/resultado (com dados persistidos)
  - Estado vazio: "Nenhuma análise ainda"

[CTA fixo ou destacado]
  - Botão primário: "Analisar nova vaga" → /adaptar
```

### 5.2 Dados necessários da API

- `GET /cv-adaptation` → lista de adaptações do usuário (já existe)
- Novo: `GET /users/me/plan` → retorna `{ planType, creditsRemaining, validUntil }`

---

## 6. Schema (Prisma) — alterações necessárias

### 6.1 `UserPlanType` enum

```prisma
enum UserPlanType {
  free
  starter    // 1 crédito
  pro        // 5 créditos
  unlimited  // 30 dias ilimitado
}
```

### 6.2 Novos campos em `User`

```prisma
model User {
  // ... campos existentes ...
  planType          UserPlanType  @default(free)   // já existe
  creditsRemaining  Int           @default(0)      // NOVO
  planActivatedAt   DateTime?                      // NOVO
  planExpiresAt     DateTime?                      // NOVO (para unlimited)
}
```

### 6.3 Novo modelo `PlanPurchase`

```prisma
model PlanPurchase {
  id                   String        @id @default(cuid())
  userId               String
  planType             UserPlanType
  amountInCents        Int
  currency             String        @default("BRL")
  paymentProvider      PaymentProvider
  paymentReference     String        @unique
  status               PaymentStatus @default(none)
  paidAt               DateTime?
  creditsGranted       Int
  createdAt            DateTime      @default(now())
  updatedAt            DateTime      @updatedAt

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, createdAt])
  @@index([paymentReference])
}
```

### 6.4 Novo campo em `CvAdaptation`

```prisma
model CvAdaptation {
  // ... campos existentes ...
  isGuestPersisted  Boolean  @default(false)  // NOVO: veio de análise guest
  guestAnalysisJson Json?                     // NOVO: JSON raw do guest (para não re-processar IA)
}
```

---

## 7. Backend (NestJS) — novos endpoints

### 7.1 `POST /cv-adaptation/guest-persist` (público autenticado)

Persiste uma análise guest como `CvAdaptation` do usuário logado.

**Request:** `{ adaptedContentJson: object, previewText: string, jobDescription: string }`  
**Response:** `{ id: string }`  
**Regras:**
- Cria `CvAdaptation` com `status: 'awaiting_payment'`, `isGuestPersisted: true`, `guestAnalysisJson`
- Não executa IA novamente
- Requer autenticação (JWT)
- Idempotente: se já existe uma com mesmo `guestAnalysisJson` do usuário nas últimas 1h, retorna o existente

### 7.2 `POST /plans/checkout`

Inicia checkout de plano.

**Request:** `{ planId: "starter" | "pro" | "unlimited" }`  
**Response:** `{ checkoutUrl: string, purchaseId: string }`  
**Regras:**
- Cria `PlanPurchase` com status `none`
- Gera preferência Mercado Pago (reutilizar `CvAdaptationPaymentService` ou extrair para `PaymentService`)
- Retorna URL de checkout
- Requer autenticação

### 7.3 `POST /plans/webhook/mercadopago`

Webhook de confirmação (mesmo padrão do webhook de adaptação existente).

**Regras:**
- Confirma pagamento via Mercado Pago API
- Atualiza `PlanPurchase.status = 'paid'`, `paidAt`
- Atualiza `User`:
  - `starter`: `creditsRemaining += 1`, `planType = 'starter'`
  - `pro`: `creditsRemaining += 5`, `planType = 'pro'`
  - `unlimited`: `creditsRemaining = -1` (sentinel para ilimitado), `planType = 'unlimited'`, `planExpiresAt = now + 30d`

### 7.4 `GET /users/me/plan`

Retorna dados do plano atual.

**Response:**
```ts
{
  planType: UserPlanType
  creditsRemaining: number | null   // null = ilimitado
  planExpiresAt: string | null
  isActive: boolean
}
```

---

## 8. Módulo de planos (NestJS)

Criar `apps/api/src/plans/`:
- `plans.module.ts`
- `plans.controller.ts` — endpoints 7.2 e 7.3
- `plans.service.ts` — lógica de ativação de créditos
- `dto/create-checkout.dto.ts`

Reutilizar `CvAdaptationPaymentService` extraindo a lógica de Mercado Pago para `PaymentService` em `packages/payment` ou `apps/api/src/shared/payment/`.

---

## 9. Rotas Next.js — resumo

| Rota | Tipo | Autenticação | Descrição |
|------|------|--------------|-----------|
| `/entrar` | server | redirect se logado | Novo login/cadastro do usuário |
| `/planos` | server | público | Página de planos |
| `/dashboard` | server | requer auth | Painel do usuário (substituir placeholder) |
| `/adaptar/resultado` | client | público | Ajustar para guest/auth |

---

## 10. Ordem de implementação

### Fase 1 — Ajustes no resultado e rota /entrar (sem backend novo)
1. Corrigir `LockedList` (contagem real de itens bloqueados)
2. Adicionar estado `isAuthenticated` na página de resultado
3. Renderização condicional: banner teaser, CTAs, unlock banner
4. Linha de urgência no bloco de conversão
5. Criar `/entrar/page.tsx` com form de login e cadastro (reutiliza endpoints existentes)
6. Suporte ao `?next` no redirect pós-auth

### Fase 2 — Schema e persistência
7. Migrations: `UserPlanType` enum, `creditsRemaining`, `planActivatedAt`, `planExpiresAt`, `PlanPurchase`, campos em `CvAdaptation`
8. Endpoint `POST /cv-adaptation/guest-persist`
9. Handoff no resultado: `persistGuestAnalysis` server action

### Fase 3 — Planos e pagamento
10. Módulo `plans` (controller + service + dto)
11. `POST /plans/checkout` e `POST /plans/webhook/mercadopago`
12. `GET /users/me/plan`
13. Página `/planos`
14. Botão de checkout no resultado (autenticado)

### Fase 4 — Dashboard
15. Substituir placeholder do `/dashboard`
16. Integrar lista de análises e dados de plano

---

## 11. O que NÃO fazer

- Não criar novo sistema de auth — usar endpoints existentes.
- Não recriar `/login` — criar `/entrar` separado.
- Não alterar `/adaptar` (upload).
- Não alterar landing page `/`.
- Não adicionar Google OAuth agora se não estiver configurado — deixar como opção desabilitada com texto "Em breve".
- Não implementar renovação automática de plano — fora do MVP.
- Não criar painel de admin de planos — fora do MVP.
