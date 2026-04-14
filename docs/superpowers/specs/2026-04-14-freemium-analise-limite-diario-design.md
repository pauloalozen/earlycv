# Spec: Freemium — Limite Diario de Analises + Creditos Separados

**Data:** 2026-04-14  
**Status:** aprovada com usuario, pronta para plano de implementacao  
**Escopo:** implementar o item 1 do plano do dia com dois sistemas independentes: credito de analise e credito de download.

---

## 0. Decisoes fechadas com o usuario

- O produto deve manter **duas regras distintas**:
  - **Creditos de analise**: usados para iniciar nova analise.
  - **Creditos de download**: ja existentes (`creditsRemaining`), usados para liberar download do CV.
- Limite diario por plano:
  - `free`: 3
  - `starter`: 6
  - `pro`: 9
  - `turbo`: 30
- Fonte dos limites diarios: env vars
  - `QNT_AN_PLAN_FREE=3`
  - `QNT_AN_PLAN_STARTER=6`
  - `QNT_AN_PLAN_PRO=9`
  - `QNT_AN_PLAN_TURBO=30`
- Reset diario em `America/Sao_Paulo` as `00:00`.
- Admin **nao** altera limite diario por usuario.
- Admin **pode** ajustar credito de analise por usuario (adicionar/remover), no mesmo padrao do ajuste atual de creditos.
- Ao comprar novo pacote/plano, os saldos comprados devem ser **somados** ao saldo atual do usuario (nao substituir):
  - credito de analise acumulativo
  - credito de download acumulativo

---

## 1. Objetivo funcional

No fluxo autenticado de analise de CV, o usuario deve passar em duas validacoes atomicas:

1. Ter pelo menos 1 credito de analise disponivel.
2. Nao ter atingido o limite diario do plano para o dia atual (timezone Sao Paulo).

Somente se as duas validacoes passarem, a analise e iniciada.

O fluxo de download/resgate continua independente e permanece usando `creditsRemaining`.

---

## 2. Arquitetura de dados

### 2.1 Alteracoes no modelo `User`

Adicionar novo campo para saldo de analise:

- `analysisCreditsRemaining Int @default(0)`

Observacao:
- `creditsRemaining` continua exclusivo para download/resgate.
- `analysisCreditsRemaining` passa a ser exclusivo para criacao de analise.

### 2.2 Novo modelo de uso diario

Criar tabela para contabilizar analises por usuario/dia:

`UserDailyAnalysisUsage`
- `id String @id @default(cuid())`
- `userId String`
- `usageDate DateTime` (data normalizada para o dia em `America/Sao_Paulo`, gravada no inicio do dia local)
- `usedCount Int @default(0)`
- `createdAt DateTime @default(now())`
- `updatedAt DateTime @updatedAt`

Indices:
- `@@unique([userId, usageDate])`
- `@@index([usageDate])`

Relacao:
- `user User @relation(fields: [userId], references: [id], onDelete: Cascade)`

---

## 3. Regras de dominio

### 3.1 Limite diario efetivo por plano

Resolver limite por `planType` do usuario usando env vars:

- `free` -> `QNT_AN_PLAN_FREE`
- `starter` -> `QNT_AN_PLAN_STARTER`
- `pro` -> `QNT_AN_PLAN_PRO`
- `turbo` -> `QNT_AN_PLAN_TURBO`

`unlimited` e `superadmin`:
- nao sofrem bloqueio de limite diario.
- nao consomem credito de analise.

### 3.2 Consumo de analise autenticada

No endpoint de analise autenticada, executar em transacao:

1. Carregar usuario (`analysisCreditsRemaining`, `planType`, `internalRole`).
2. Resolver `usageDate` do dia corrente em `America/Sao_Paulo`.
3. Buscar ou criar linha `UserDailyAnalysisUsage` para `(userId, usageDate)`.
4. Validar credito de analise (`analysisCreditsRemaining >= 1`) para usuarios sem bypass.
5. Validar limite diario (`usedCount < dailyLimit`) para usuarios sem bypass.
6. Se valido, consumir:
   - `analysisCreditsRemaining: decrement 1`
   - `usedCount: increment 1`
7. Continuar fluxo normal da analise.

Mensagens de erro de produto:
- sem credito de analise: "Voce nao tem creditos de analise disponiveis."
- limite diario atingido: "Voce atingiu o limite diario de analises do seu plano."

### 3.3 Independencia entre creditos

- `analysisCreditsRemaining` nunca e alterado por download/resgate.
- `creditsRemaining` nunca e alterado por criacao de analise.

### 3.4 Regra de acumulacao na compra de pacote

No fluxo de ativacao de compra (`plans` webhook/confirmacao):

- nunca sobrescrever saldo existente com valor fixo do pacote.
- sempre aplicar incremento em ambos os saldos comprados:
  - `analysisCreditsRemaining: { increment: purchasedAnalysisCredits }`
  - `creditsRemaining: { increment: purchasedDownloadCredits }`

Exemplo:
- usuario com `analysisCreditsRemaining = 2` e `creditsRemaining = 1`
- compra pacote com `+6` analises e `+3` downloads
- resultado esperado: `analysisCreditsRemaining = 8` e `creditsRemaining = 4`

Observacao:
- esta regra de acumulacao vale para compras consecutivas e para recompras do mesmo plano.

---

## 4. API e contratos

### 4.1 Endpoint de plano do usuario (`GET /plans/me`)

Ampliar payload atual para incluir dados de analise diaria:

```ts
{
  planType: "free" | "starter" | "pro" | "turbo" | "unlimited";
  creditsRemaining: number | null;          // download/resgate
  analysisCreditsRemaining: number | null;  // analise
  dailyAnalysisLimit: number | null;
  dailyAnalysisUsed: number;
  dailyAnalysisRemaining: number | null;
  planExpiresAt: string | null;
  isActive: boolean;
}
```

Notas:
- Em plano ilimitado, campos diarios podem retornar `null` para limite/restante.
- Em plano ilimitado/superadmin, `analysisCreditsRemaining` pode retornar `null`.
- `dailyAnalysisUsed` pode retornar `0` quando nao houver registro no dia.

### 4.2 Admin users API

Adicionar endpoint dedicado para ajustar credito de analise por usuario:

- `PATCH /admin/users/:id/analysis-credits`
  - body: `{ analysisCreditsRemaining: number }`
  - regra: inteiro >= 0

Manter endpoint existente:
- `PATCH /admin/users/:id/credits` (download/resgate)

---

## 5. Admin web (tela de usuario)

Na rota `apps/web/src/app/admin/usuarios/[id]/page.tsx`:

- manter card/form atual "Ajustar creditos" (download).
- adicionar novo card/form "Ajustar creditos de analise" com input absoluto.
- mesma UX do formulario atual:
  - validacao client/server
  - mensagem de sucesso/erro
  - `revalidatePath` para detalhe e listagem de usuarios.

No contrato do `admin-users-api`:
- incluir `analysisCreditsRemaining` em `AdminUserRecord`.
- incluir funcao server-side para chamar novo endpoint.

---

## 6. Dashboard web

Exibir explicitamente os dois contextos para evitar ambiguidade:

- Bloco 1: `Creditos de analise` (saldo atual)
- Bloco 2: `Analises hoje` (`dailyAnalysisUsed / dailyAnalysisLimit`)
- Bloco 3: `Restante hoje` (`dailyAnalysisRemaining`)
- Bloco 4: `Creditos de download` (saldo atual ja existente)

Texto auxiliar recomendado:
- "Limite diario reinicia as 00:00 (America/Sao_Paulo)."

---

## 7. Timezone e normalizacao de data

Para evitar inconsistencias de dia:

- calcular o "dia logico" sempre com `America/Sao_Paulo`.
- normalizar `usageDate` para o inicio do dia local (00:00:00) antes de persistir.
- nunca usar comparacao por UTC puro sem converter para timezone de negocio.

---

## 8. Observabilidade minima do item 1

Adicionar logs estruturados nos pontos de decisao:

- bloqueio por falta de credito de analise
- bloqueio por limite diario
- consumo bem-sucedido de analise

Campos sugeridos de log:
- `userId`, `planType`, `usageDate`, `dailyLimit`, `dailyUsedBefore`, `analysisCreditsBefore`, `decision`

---

## 9. Testes necessarios

### 9.1 API/domain

- deve bloquear analise sem `analysisCreditsRemaining`.
- deve bloquear analise ao atingir limite diario por plano.
- deve permitir analise quando ha credito e limite disponivel.
- deve decrementar 1 credito de analise e incrementar 1 uso diario no sucesso.
- nao deve afetar `creditsRemaining` no fluxo de analise.
- deve respeitar reset por dia em `America/Sao_Paulo`.
- `superadmin` deve bypassar bloqueios.

### 9.2 Admin API/web

- `PATCH /analysis-credits` aceita inteiro >= 0 e rejeita invalido.
- pagina admin exibe e atualiza corretamente os dois saldos.

### 9.3 Dashboard

- mostra os quatro sinais (credito analise, usado hoje, restante hoje, credito download).
- mostra copy de reset diario.

---

## 10. Fora de escopo deste item

- Ajuste global de limites diarios por painel admin.
- Regras de rollover de limite diario.
- Recompensa automatica diaria de creditos de analise.
- Mudancas nos itens 2, 3, 4 e 5 do plano do dia.

---

## 11. Riscos e mitigacoes

- **Concorrencia em consumo:** mitigar com transacao e chave unica `(userId, usageDate)`.
- **Confusao entre tipos de credito:** mitigar com naming explicito em API e UI.
- **Fuso horario inconsistente:** centralizar helper de data de negocio (Sao Paulo).
- **Regressao em fluxo atual:** manter `creditsRemaining` isolado e cobrir com testes.
