# Design: Admin "Eventos e logs" para disparo sintético de eventos

Data: 2026-04-24
Status: proposed
Escopo: apps/api + apps/web (rota interna `/admin/eventos-e-logs`)

## 1. Objetivo

Criar uma sessao operacional no admin para disparar eventos existentes de telemetria e funil, de forma controlada, para que o PostHog capture os eventos no banco. A sessao deve permitir:

1. Disparo unitario por evento.
2. Disparo em lote por dominio (`protection` ou `business`).
3. Disparo global de todos os eventos.

Todos os disparos dessa ferramenta devem carregar `metadata.synthetic = true` para separacao entre eventos reais e artificiais.

## 2. Requisitos funcionais

### 2.1 Rota e navegacao

- Nova pagina: `/admin/eventos-e-logs`.
- Incluir item no sidebar do admin com rotulo "Eventos e logs".
- Pagina segue padrao visual do backoffice atual (`AdminShellHeader`, cards/listas, estados de erro com `AdminTokenState` quando aplicavel).

### 2.2 Lista de eventos

A pagina exibe duas secoes:

- `AnalysisProtectionEvent` (todos os eventos do registry canônico).
- `BusinessFunnelEvent` (todos os eventos do registry canônico).

Cada item mostra ao menos:

- Nome do evento.
- Versao (atualmente `1`).
- Acao "Disparar evento".

### 2.3 Acoes de disparo

Disponibilizar botoes:

- Por linha: disparar 1 evento.
- Por secao: disparar todos de `protection`.
- Por secao: disparar todos de `business`.
- Global: disparar todos os eventos.

### 2.4 Resultado operacional

- A UI deve mostrar retorno por execucao (resumo e itens com sucesso/falha).
- Falha de um evento nao deve impedir processamento dos demais em lote.

## 3. Requisitos nao funcionais

- Disponivel tambem em producao.
- Restrito a usuarios com papel interno `admin` ou `superadmin`.
- Sem insercao de metadados extras de rastreio operacional alem de `synthetic: true`.
- Sem envio de dados sensiveis nesse fluxo.

## 4. Arquitetura proposta

## 4.1 API (backend)

Adicionar endpoint administrativo dedicado em `apps/api`:

- Metodo/rota: `POST /api/admin/analysis-observability/events/emit`.
- Guards e roles: `JwtAuthGuard`, `RolesGuard`, `@InternalRoles("admin", "superadmin")`.

Entrada (`EmitAdminEventsDto`):

- `mode`: `"single" | "group" | "all"`.
- `eventName?`: string (obrigatorio quando `mode = single`).
- `group?`: `"protection" | "business"` (obrigatorio quando `mode = group`).

Regras de validacao:

- `single` exige `eventName` presente e valido no registry.
- `group` exige `group`.
- `all` ignora `eventName`/`group`.

Resposta (`EmitAdminEventsResponse`):

- `requested`: number
- `sent`: number
- `failed`: number
- `results`: Array<{ eventName: string; domain: "protection" | "business"; status: "sent" | "failed"; error?: string }>

## 4.2 Servico de emissao administrativa

Criar servico orquestrador em `apps/api/src/analysis-observability` para centralizar logica de lote.

Fontes canonicas de eventos:

- `ANALYSIS_PROTECTION_EVENT_VERSION_MAP`
- `BUSINESS_FUNNEL_EVENT_VERSION_MAP`

Execucao por dominio:

- `business`: usa `BusinessFunnelEventService.record(...)` com `eventVersion` do registry, idempotency key unica por execucao, metadata `{ synthetic: true }` e `source` resolvido via `FUNNEL_EVENT_OWNERSHIP` (para respeitar validacao de ownership existente no servico).
- `protection`: usa `AnalysisTelemetryService.emit(...)` com metadata `{ synthetic: true }`.

Contexto tecnico (`AnalysisRequestContext`) para disparos admin:

- requestId/correlationId derivados da requisicao admin.
- routePath coerente com a rota admin.
- userId quando disponivel (do token autenticado).

Politica de lote:

- processar todos os eventos solicitados;
- acumular erros por item;
- retornar relatorio consolidado de sucesso parcial quando houver falhas pontuais.

## 4.3 Web (frontend)

Nova pagina em `apps/web/src/app/admin/eventos-e-logs/page.tsx`:

- Server action chamando client de API admin dedicado.
- Renderiza secoes `protection` e `business` usando listas derivadas de resposta da API (ou constantes compartilhadas retornadas pelo endpoint de catalogo, ver secao 5).
- Botoes por item, por grupo e global.
- Exibe resultado da ultima operacao com contagem e detalhes por evento.

Navegacao:

- Atualizar `adminNavItems` em `apps/web/src/lib/admin-users-operations.ts` para incluir `{ href: "/admin/eventos-e-logs", label: "Eventos e logs" }`.

## 5. Contrato de dados e catalogo

Para evitar duplicacao de fonte de verdade entre web e api, adotar endpoint de catalogo no admin:

- `GET /api/admin/analysis-observability/events/catalog`

Resposta:

- `protection`: Array<{ eventName: string; eventVersion: number }>
- `business`: Array<{ eventName: string; eventVersion: number }>

Com isso, a UI lista exatamente o mesmo conjunto versionado usado no backend para disparo.

## 6. Erros e resiliencia

Erros estruturais (input invalido, autenticacao, autorizacao):

- retornar `400/401/403` conforme caso.

Erros por evento em lote:

- nao interromper lote completo;
- registrar `status = failed` no item;
- devolver mensagem curta em `error`.

## 7. Testes

## 7.1 API

- Controller/service specs para `single`, `group`, `all`.
- Validacao de payload invalido.
- Cobertura de sucesso parcial.
- Garantia de `metadata.synthetic = true` em ambos dominios.
- Garantia de bloqueio para usuarios sem role interna admin/superadmin.

## 7.2 Web

- Spec para render da pagina `/admin/eventos-e-logs`.
- Spec para exibicao das duas secoes e botoes esperados.
- Spec para server action montando payload correto por modo.
- Spec para feedback de resultado (contagens e erros por item).

## 8. Seguranca e operacao

- Acesso restrito a admin/superadmin.
- Ferramenta permitida em producao por requisito operacional.
- Marcacao sintetica obrigatoria (`synthetic: true`) para filtro no PostHog.

## 9. Criterios de aceite

1. Admin consegue disparar um evento individual de qualquer dominio.
2. Admin consegue disparar todos os eventos de `protection`.
3. Admin consegue disparar todos os eventos de `business`.
4. Admin consegue disparar todos os eventos em uma unica acao.
5. Eventos chegam ao PostHog com `metadata.synthetic = true`.
6. UI exibe retorno por evento (sent/failed) e resumo agregado.

## 10. Fora de escopo

- Criar novos eventos de produto.
- Alterar semantica dos eventos existentes.
- Criar pipeline adicional de analytics alem do ja integrado com PostHog.
