# Memoria de implementacao — Observabilidade e admin de eventos

Data: 2026-04-24

## Decisoes

- Criada superficie administrativa em `/admin/eventos-e-logs` para inspeção/acionamento manual de eventos de protecao e negocio.
- Eventos de teste disparados por admin devem carregar somente `synthetic: true` como sinal de origem.
- `site_exit` passou a ser evento explicito de funil e deve aparecer no catalogo admin.
- Para reduzir perda de evento em fechamento de aba, `site_exit` usa caminho com `sendBeacon` quando disponivel.
- Para reduzir ruido em navegacao, emissao de `page_leave` foi ajustada para transicoes reais + `pagehide` com dedupe por `routeVisitId`.
- `user_id` em contexto de request passou a ser resolvido via access token valido (Bearer ou cookie), sem quebrar fluxo guest.

## Riscos monitorados

- Possivel overcount de `site_exit` por sessao mitigado com marcador em `sessionStorage`.
- Ambiente com CORS estrito exigiu `credentials: true` para fluxo de beacon/preflight em producao.

## Proximos checkpoints

- Confirmar em PostHog que `site_exit` e `user_id` chegam com consistencia em sessoes autenticadas.
- Rodar checklist operacional do runbook de eventos apos deploy (`docs/runbook/events.md`).
