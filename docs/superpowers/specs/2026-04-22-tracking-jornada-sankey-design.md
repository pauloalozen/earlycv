# Tracking de Jornada + Sankey Design (EarlyCV)

Date: 2026-04-22
Status: Implemented and verified (2026-04-23)
Scope: `apps/web`, `apps/api`, `packages/database` (apenas se precisar migration de suporte)

## Execução registrada (memória)

- Implementação concluída com camada global de jornada no web e validação de ownership/versionamento no api.
- Correções adicionais de suíte preexistente aplicadas em `apps/api` e `apps/web` para estabilidade de testes.
- Verificação final executada com `npm test` no monorepo (todas as workspaces em verde).

## 1) Objetivo e Regras Inegociáveis

### Objetivo

- Capturar jornada completa de produto para análise de fluxo (Sankey no PostHog): entrada, navegação, interações-chave, abandono e saída.
- Permitir responder: caminhos mais comuns, pontos de abandono, tempo por etapa e fluxos alternativos.

### Regras obrigatórias

- Não alterar UI.
- Não alterar fluxo de produto.
- Não duplicar eventos existentes.
- Respeitar ownership frontend vs backend.
- Manter idempotência.
- Manter `eventVersion`.
- Manter correlação (`requestId`, `correlationId`, `sessionInternalId`, `userId`).
- Escopo de rastreio: somente jornada de produto (excluir `/admin` e `/superadmin`).

## 2) Arquitetura Aprovada

- Implementar camada central de tracking no frontend para jornada, reutilizando `emitBusinessFunnelEvent`.
- Backend permanece coletor e fonte de verdade para validação de contrato, ownership, idempotência e export PostHog.
- Não inferir navegação principal no backend.
- Não criar SDK compartilhado amplo nesta fase.
- `session_started` dispara no primeiro `page_view` elegível da sessão dentro do escopo rastreado.
- `session_engaged` dispara na primeira interação ativa.
- `page_leave` é best-effort e não bloqueia navegação.

## 3) Eventos e Ownership

### 3.1 Novos eventos frontend

- `session_started`
- `session_engaged`
- `page_view`
- `page_leave`
- `cv_upload_clicked`
- `job_description_focus`
- `job_description_paste`
- `teaser_scroll`
- `cta_signup_click`
- `download_cv_clicked`
- `checkout_abandoned`

### 3.2 Evento backend-owned

- `payment_failed` (origem backend por confiabilidade de status real de pagamento)

### 3.3 Eventos já existentes a preservar

- Manter eventos já usados no funil atual (por exemplo `adapt_page_view`, `cv_upload_started`, `cv_upload_completed`, `job_description_filled`, `analyze_submit_clicked`, `analysis_started`) sem duplicação funcional.
- A camada nova deve complementar a leitura de jornada e não substituir sem necessidade o histórico existente.

## 4) Data Contract Obrigatório

Todos os eventos de jornada devem conter:

- `eventName`
- `eventVersion`
- `occurredAt`
- `sessionInternalId`
- `routeVisitId`
- `userId` (`null` quando anônimo)
- `route`
- `previous_route` (quando aplicável; `null` no primeiro evento elegível)

Campos de correlação também devem ser preservados no pipeline:

- `requestId` (quando disponível)
- `correlationId` (quando disponível)

Observações:

- Não incluir `userEmail` nesta entrega.
- `occurredAt` é timestamp de ocorrência no cliente; `createdAt` backend segue como timestamp de ingestão.

Lifecycle de `routeVisitId`:

- Gerado em cada `page_view` elegível.
- Mantido como contexto da visita de rota para eventos subsequentes daquela página.
- Encerrado no `page_leave` correspondente (quando emitido).
- Uma nova navegação elegível sempre cria novo `routeVisitId`.

## 5) Idempotência, Sequência Temporal e Sankey

### 5.1 Idempotência

- Definir `idempotencyKey` determinística por evento quando necessário.
- Usar composição com `sessionInternalId`, `routeVisitId` e `eventName` para dedupe confiável.
- Para eventos one-shot de sessão (`session_started`, `session_engaged`), garantir disparo único por sessão.

### 5.2 Sequência temporal

- Toda emissão deve carregar `occurredAt`.
- `previous_route` deve ser resolvido a partir da última rota elegível observada na sessão.
- `page_view -> page_leave` deve ser tratada como consistência best-effort quando ambos existirem; não assumir completude absoluta do ciclo de vida da página.

### 5.3 Definição formal de rota elegível

- Rota elegível é qualquer pathname de tela de produto/candidato renderizada no App Router e fora de backoffice.
- Exclusões obrigatórias: `/admin` e `/superadmin` e todos os seus descendentes.
- Inclusões explícitas do fluxo de produto: landing, autenticação, adaptação, resultado, planos, dashboard e demais telas de jornada do candidato.

### 5.4 Compatibilidade com Sankey

- Cadeia de rota consistente (`route` + `previous_route`).
- Sessão contínua por `sessionInternalId`.
- Não duplicação por guard frontend + dedupe backend.

## 6) Desenho da Camada Central no Frontend

### 6.1 Local de integração

- Integrar no template cliente global (`apps/web/src/app/template.tsx`) para observar transições de rota elegíveis.
- Criar módulo central de tracking em `apps/web/src/lib` para encapsular contrato e emissão.

### 6.2 Responsabilidades do tracker

- Resolver elegibilidade de rota (ignorar `/admin`, `/superadmin`).
- Gerenciar estado de sessão local (`sessionInternalId`, `previous_route`, `routeVisitId`).
- Emitir `page_view` e `page_leave`.
- Emitir `session_started` no primeiro `page_view` elegível.
- Registrar listener global para primeira interação ativa e emitir `session_engaged`.
- Expor função única de emissão para micro-interações (`trackJourneyEvent`).

### 6.3 Resiliência

- Emissão sempre fire-and-forget sem bloquear UX.
- Sem `await` em handlers críticos de navegação/interação.
- Em ambiente de desenvolvimento, permitir log/debug local de falha de envio sem alterar comportamento em produção.

## 7) Pontos de Instrumentação de Micro-Interações

- `cv_upload_clicked`: clique no gatilho de upload em `/adaptar`.
- `job_description_focus`: primeiro foco do campo de descrição da vaga por visita de página.
- `job_description_paste`: primeiro paste no campo por visita de página.
- `teaser_scroll`: cruzar limiar de visibilidade/scroll no bloco teaser.
- `cta_signup_click`: CTA de cadastro em pontos principais da jornada.
- `download_cv_clicked`: clique de download no resultado (`format` em metadata).
- `checkout_abandoned`: heurística frontend para abandono após intenção de checkout sem confirmação.

Regra explícita de `checkout_abandoned` (consistência):

- Ao iniciar checkout a partir de `/planos`, salvar marcador local `checkout_intent` com `sessionInternalId`, `planId`, `startedAt` e `routeVisitId`.
- Emitir `checkout_abandoned` uma única vez por marcador quando houver retorno do usuário para rota elegível sem confirmação de compra no contexto da sessão e com janela mínima de estabilização (ex.: 60s) para evitar falso positivo de redirecionamento.
- Limpar marcador sem emitir abandono quando houver confirmação de compra observável no app (crédito/plano refletido) ou evento terminal de pagamento (`purchase_completed` ou `payment_failed`) no contexto da sessão.
- Idempotência por chave derivada do marcador (`sessionInternalId:planId:checkout_abandoned`).

Detalhe de implementação:

- Quando houver evento legado semanticamente próximo, evitar dupla emissão para o mesmo momento de usuário.

## 8) Mudanças no Backend

### 8.1 Registro de eventos

- Atualizar `BUSINESS_FUNNEL_EVENT_VERSION_MAP` com novos eventos (todos versão inicial `1`).
- Atualizar `FUNNEL_EVENT_OWNERSHIP` com ownership correto:
  - novos eventos de jornada: `frontend`
  - `payment_failed`: `backend`

### 8.2 Validação e dedupe

- Manter validações já existentes de nome/version/ownership.
- Manter dedupe por `idempotencyKey` (índice único existente).

### 8.3 Export PostHog

- Mapear novos eventos no exporter.
- Manter propriedades padrão de correlação e contexto de rota.
- Garantir que `userId` seja encaminhado quando disponível.

## 9) Estratégia de Testes

### 9.1 Frontend (unit/integration)

- `session_started` no primeiro `page_view` elegível.
- `session_engaged` apenas uma vez na primeira interação ativa.
- `previous_route` correto nas transições.
- `page_leave` best-effort com `time_on_page_ms` calculável.
- Ausência de duplicidade para eventos one-shot.
- Exclusão de rotas fora do escopo (`/admin`, `/superadmin`).
- Disparo correto dos micro-eventos essenciais.

### 9.2 Backend (unit)

- Novos eventos aceitos com `eventVersion` correto.
- Rejeição para `eventVersion` incorreto.
- Rejeição para ownership incompatível.
- Deduplicação por `idempotencyKey`.

### 9.3 Jornada rastreável ponta a ponta

- Simular jornada de produto completa com sequência temporal consistente.
- Validar que o conjunto permite construir Sankey sem lacunas estruturais de contrato.

## 10) Plano de Entrega (incremental sem risco)

1. Adicionar tracker central frontend (sem remover eventos atuais).
2. Instrumentar `page_view`, `page_leave`, `session_started`, `session_engaged`.
3. Instrumentar micro-interações essenciais nos pontos mapeados.
4. Atualizar registry/ownership/export backend para novos eventos.
5. Fechar testes e validar ausência de duplicidade.

## 11) Critérios de Aceite

- Jornada de produto rastreável do início ao abandono/saída.
- `route` e `previous_route` consistentes para análise de fluxo.
- `time_on_page_ms` disponível quando `page_leave` existir.
- Sessões totais (`session_started`) e engajadas (`session_engaged`) mensuráveis separadamente.
- Nenhuma alteração perceptível de UX/fluxo.
- Sem duplicidade relevante de eventos.

## 12) Fora de Escopo

- SDK de analytics compartilhado de amplo escopo.
- Reestruturação completa de eventos legados não necessária para o objetivo de Sankey.
- Tracking de áreas de backoffice (`/admin`, `/superadmin`).
