## Falhas pre-existentes conhecidas

- **POST /cv-adaptation/analyze-guest blocks missing turnstile token** (`apps/api/src/cv-adaptation/cv-adaptation.e2e-spec.ts`)
  - Falha atual: validacao de tamanho do CV roda antes da validacao de turnstile, retornando "O texto do CV esta muito curto" em vez da mensagem esperada de turnstile.
  - Identificada durante validacao consolidada da Fase 1 do hardening de ingestao (data: 23/05/2026).
  - Confirmado como pre-existente: nenhum commit dos PRs Ghost Mode, Stale Lifecycle, Circuit Breaker 403 ou Dedup tocou em `cv-adaptation/`.
  - Acao: ajustar ordem de validacao no controller/service de cv-adaptation, fora do escopo da Fase 1.
