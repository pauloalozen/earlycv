# Design: metadados de item no Mercado Pago (global)

## Contexto

O Mercado Pago recomendou enriquecer os itens enviados na criacao de preferencias com:

- `items.category_id`
- `items.description`

No EarlyCV, ja padronizamos `back_urls` e `auto_return` globalmente. Este ajuste e incremental e deve valer para **todos os fluxos atuais de checkout MP** (planos e desbloqueio de CV), sem alterar logica de negocio.

## Objetivo

Aplicar os dois campos recomendados do MP (`category_id` e `description`) em todos os itens de preferencias criadas no backend, com padronizacao compartilhada para evitar divergencia futura.

## Escopo

- `apps/api/src/cv-adaptation/cv-adaptation-payment.service.ts`
- `apps/api/src/plans/plans.service.ts`
- helper compartilhado em `apps/api/src/payments` (evolucao do padrao atual)
- testes unitarios/service associados aos dois fluxos

## Fora de escopo

- provider de pagamento
- webhook
- fluxo de credito/desbloqueio
- frontend/telas/rotas
- schema Prisma/migrations
- ajustes de preco/quantidade

## Abordagens consideradas

1. **Patch local por service**: rapido, mas propenso a drift.
2. **Padronizacao no helper compartilhado (recomendada)**: consistente e manutencao melhor.

Decisao: **abordagem 2**.

## Design tecnico

### 1) Helper compartilhado para metadados de item

Criar/estender helper em `apps/api/src/payments` para construir os campos de item recomendados pelo MP:

- `category_id`
- `description`

Entrada prevista:

- tipo de fluxo (`cv_adaptation` | `plan_purchase`)
- contexto minimo para descricao (ex.: label do plano)

Saida:

- objeto parcial de item para merge no payload `items[]`

### 2) Integracao nos fluxos atuais

- `cv-adaptation-payment.service.ts`: item da preferencia passa a incluir metadados do helper.
- `plans.service.ts`: item da preferencia passa a incluir metadados do helper.

Sem alterar:

- `id`, `title`, `quantity`, `unit_price`, `currency_id`
- `back_urls` e `auto_return`

### 3) Testes

- cobrir que os dois fluxos enviam `items[0].category_id`
- cobrir que os dois fluxos enviam `items[0].description`
- manter cobertura atual de `back_urls` + `auto_return`

## Criterios de aceite

- Todas as preferencias MP (planos + unlock CV) incluem `items.category_id` e `items.description`.
- Sem regressao de checkout URL, webhook, unlock e creditos.
- Testes relevantes passam.

## Riscos e mitigacoes

- **Risco:** categoria invalida para o MP.
  - **Mitigacao:** centralizar no helper para ajuste unico e rapido se necessario.
- **Risco:** divergencia entre fluxos no futuro.
  - **Mitigacao:** manter os dois campos encapsulados em helper compartilhado com testes.
