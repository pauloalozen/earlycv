# Security Hardening Evidence - 2026-05-11

## Escopo

Consolidacao final do hardening de seguranca do EarlyCV para os itens 1 a 8:

1. Dominio/e-mail spoofing
2. IDOR/autorizacao por objeto
3. Pagamento/webhook/idempotencia
4. Upload PDF/DOCX/ODT + abuso IA/custo
5. Admin surface
6. CSP/headers
7. Logs/alertas de seguranca
8. Evidencia final + go/no-go deploy

## Ambiente

- Branch: `hotfix/security-hardening-2026-05-11`
- Frontend: Next.js (Vercel)
- Backend: NestJS (Railway)
- Banco: Prisma/PostgreSQL
- Pagamento: Mercado Pago
- Observabilidade: PostHog/GA4
- DNS/e-mail: Cloudflare/Zoho/Resend

## Itens fechados

### Item 1 - Dominio/e-mail spoofing

- Objetivo: reduzir spoofing e elevar autenticidade de e-mail.
- Alteracoes principais: SPF/DKIM/DMARC validados; DMARC em `p=quarantine`.
- Arquivos principais: alteracao operacional fora do monorepo.
- Testes executados: validacao operacional em provedores.
- Resultado: fechado com ressalva.
- Evidencia operacional: configuracoes aplicadas e revisadas nos provedores.

### Item 2 - IDOR/autorizacao por objeto

- Objetivo: impedir acesso cruzado entre usuarios por ID previsivel.
- Alteracoes principais: ownership reforcado em fluxos de adaptacao/pagamento/checkout.
- Arquivos principais:
  - `apps/api/src/cv-adaptation/cv-adaptation.service.ts`
  - `apps/api/src/plans/plans.service.ts`
  - `apps/api/src/payments/payments.service.ts`
- Testes executados: suites focadas de `cv-adaptation`, `plans` e `payments`.
- Resultado: fechado.
- Evidencia operacional: acessos de usuario A em recurso de usuario B retornam bloqueio/nao encontrado.

### Item 3 - Pagamento/webhook/idempotencia

- Objetivo: impedir liberacao indevida e duplicidade de beneficio.
- Alteracoes principais:
  - callback/query string nao concede beneficio por si;
  - replay/idempotencia validado;
  - transicoes de status protegidas;
  - ownership e auto-unlock validados.
- Arquivos principais:
  - `apps/api/src/plans/plans.service.ts`
  - `apps/api/src/payments/payments.service.ts`
  - `apps/api/src/plans/plans.service.spec.ts`
  - `apps/api/src/payments/payments.service.spec.ts`
  - `apps/api/src/plans/plans-auto-unlock.e2e-spec.ts`
- Testes executados:
  - `npm run test --workspace @earlycv/api -- src/plans/plans-auto-unlock.e2e-spec.ts` -> PASS
  - `npm run test --workspace @earlycv/api -- src/plans/plans.service.spec.ts` -> PASS
  - `npm run test --workspace @earlycv/api -- src/payments/payments.controller.spec.ts` -> PASS
  - `npm run test --workspace @earlycv/api -- src/payments/payments.service.spec.ts` -> PASS
- Resultado: fechado.
- Evidencia operacional: aprovacao aplica uma vez; pendente/falha nao aplicam; replay nao duplica.

### Item 4 - Upload PDF/DOCX/ODT + abuso IA/custo

- Objetivo: endurecer entrada de arquivo e bloquear abuso antes da IA.
- Alteracoes principais:
  - DOC legado removido;
  - PDF, DOCX e ODT com validacoes de envelope/assinatura/estrutura;
  - limites e timeout aplicados;
  - bloqueio pre-IA para payload invalido.
- Arquivos principais:
  - `apps/api/src/common/cv-file-formats.ts`
  - `apps/api/src/common/cv-text-extractor.ts`
  - `apps/api/src/common/cv-text-extractor.spec.ts`
  - `apps/api/src/cv-adaptation/cv-adaptation.service.ts`
  - `apps/api/src/cv-adaptation/cv-adaptation.service.spec.ts`
  - `packages/ai/src/pdf-parser.ts`
  - `packages/ai/src/pdf-parser.spec.ts`
  - `apps/web/src/app/adaptar/page.tsx`
- Testes executados:
  - `npm run test --workspace @earlycv/api -- src/common/cv-text-extractor.spec.ts` -> PASS
  - `npm run test --workspace @earlycv/api -- src/cv-adaptation/cv-adaptation.service.spec.ts` -> PASS
  - `npm run test --workspace @earlycv/api -- "src/analysis-protection/**/*.spec.ts" src/cv-adaptation/cv-adaptation-protected-analyze.service.spec.ts` -> PASS
  - `npm run test --workspace @earlycv/ai -- src/pdf-parser.spec.ts` -> PASS
  - `npm run build --workspace @earlycv/api` -> PASS
- Resultado: fechado.
- Evidencia operacional: `.doc` rejeitado; envelope invalido bloqueado antes da IA.

### Item 5 - Admin surface

- Objetivo: reduzir exposicao de superfices internas.
- Alteracoes principais:
  - `notFound()` server-side em `/admin` e `/superadmin` sem autorizacao;
  - robots/sitemap/noindex ajustados;
  - guards/roles backend revisados.
- Arquivos principais:
  - `apps/web/src/app/admin/layout.tsx`
  - `apps/web/src/app/superadmin/layout.tsx`
  - `apps/web/src/app/robots.ts`
  - `apps/api/src/common/admin-surface-guards.spec.ts`
- Testes executados:
  - `npm run test --workspace @earlycv/web` -> PASS
  - `npm run build --workspace @earlycv/web` -> PASS
  - `npm run test --workspace @earlycv/api -- src/common/admin-surface-guards.spec.ts src/payments/payments.controller.spec.ts src/analysis-protection/analysis-config.controller.spec.ts src/analysis-observability/admin-events.controller.spec.ts` -> PASS
- Resultado: fechado com ressalva.
- Evidencia operacional: rotas admin devem ser validadas novamente no ambiente publicado.

### Item 6 - CSP/headers

- Objetivo: endurecer baseline de seguranca HTTP sem indisponibilizar fluxos criticos.
- Alteracoes principais:
  - headers de seguranca aplicados globalmente;
  - `X-Robots-Tag` para admin/superadmin;
  - CSP mantida em `Report-Only` intencionalmente.
- Arquivos principais:
  - `apps/web/next.config.ts`
  - `apps/web/src/next-config-headers.spec.ts`
- Testes executados:
  - `npm run test --workspace @earlycv/web` -> PASS
  - `npm run build --workspace @earlycv/web` -> PASS
- Resultado: fechado com ressalva.
- Evidencia operacional: headers confirmados localmente; validacao final em producao pendente no checklist pos-deploy.

### Item 7 - Logs e alertas de seguranca

- Objetivo: reduzir risco de vazamento em logs/audit e elevar rastreabilidade minima.
- Alteracoes principais:
  - `PaymentAuditLog.rawPayload` sanitizado por whitelist;
  - erro de provider sanitizado;
  - telemetria minima de upload/parser em `payload_invalid`.
- Arquivos principais:
  - `apps/api/src/payments/payment-audit-sanitization.ts`
  - `apps/api/src/payments/payment-audit-sanitization.spec.ts`
  - `apps/api/src/plans/plans.service.ts`
  - `apps/api/src/payments/payments.service.ts`
  - `apps/api/src/cv-adaptation/cv-adaptation.service.ts`
  - `docs/runbook/security-incident-response.md`
- Testes executados:
  - `npm run test --workspace @earlycv/api -- src/plans/plans.service.spec.ts src/payments/payments.service.spec.ts` -> PASS
  - `npm run test --workspace @earlycv/api -- src/cv-adaptation/cv-adaptation.service.spec.ts` -> PASS
  - `npm run test --workspace @earlycv/api -- src/common/cv-text-extractor.spec.ts` -> PASS
  - `npm run test --workspace @earlycv/api -- src/payments/payment-audit-sanitization.spec.ts` -> PASS
  - `npm run test --workspace @earlycv/api -- "src/analysis-protection/**/*.spec.ts"` -> PASS
  - `npm run build --workspace @earlycv/api` -> PASS
- Resultado: fechado com ressalva.
- Evidencia operacional: novos audits nao devem conter payload bruto sensivel.

### Item 8 - Evidencia final / go-no-go deploy

- Objetivo: consolidar evidencias, riscos e checklist operacional de deploy seguro.
- Alteracoes principais:
  - consolidacao documental final
  - checklist de validacao pos-deploy
  - consolidacao de comando/testes/builds
- Arquivos principais:
  - `docs/security/security-hardening-checklist.md`
  - `docs/security/security-evidence-2026-05-11.md`
  - `docs/runbook/security-incident-response.md`
- Testes executados: ver secoes acima + validacao final desta rodada.
- Resultado: fechado.
- Evidencia operacional: criterio go/no-go objetivo descrito abaixo.

## Riscos residuais aceitos

- DMARC ainda em `p=quarantine` (nao `reject`).
- CSP ainda em `Report-Only` por decisao consciente.
- `requestId/correlationId` nativo no `PaymentAuditLog` ficou como P1 (sem migration nesta rodada).
- alertas automaticos dedicados ficaram como P1.
- validacao pos-deploy de `/admin` e `/superadmin` deve ser executada no ambiente publicado.
- suite global API pode depender de DB/env local em algumas execucoes.
- `application/octet-stream` aceito para DOCX/ODT, mitigado por assinatura/estrutura.

## O que nao foi alterado

- precos/planos
- default checkout mode
- ativacao Brick
- schema/migrations nesta rodada de Item 8
- UX publica, salvo remocao previa de `.doc` em `accept`/mensagem no item de upload
- landing/blog/SEO de conteudo

## Checklist pos-deploy

### Admin surface

- `curl -I -L https://earlycv.com.br/admin`
- `curl -I -L https://earlycv.com.br/superadmin`
- `curl -s -L https://earlycv.com.br/admin | grep -Ei "token|backoffice|superadmin|admin / acesso|HttpOnly" || echo "OK"`
- `curl -s -L https://earlycv.com.br/superadmin | grep -Ei "token|backoffice|superadmin|admin / acesso|HttpOnly" || echo "OK"`

### Headers

- `curl -I https://earlycv.com.br/`
- `curl -I https://earlycv.com.br/admin`
- `curl -I https://earlycv.com.br/superadmin`
- `curl -I https://earlycv.com.br/adaptar`
- `curl -I https://earlycv.com.br/pagamento/concluido`

Verificar:

- `Strict-Transport-Security`
- `X-Content-Type-Options`
- `Referrer-Policy`
- `Permissions-Policy`
- `X-Frame-Options`
- `Content-Security-Policy-Report-Only`
- `X-Robots-Tag` apenas em admin/superadmin

### Upload

- testar upload PDF valido pequeno
- testar DOCX valido pequeno
- testar ODT valido pequeno (se viavel)
- testar `.doc` rejeitado
- testar arquivo invalido renomeado para `.pdf` rejeitado
- confirmar erro controlado

### Pagamento

- testar checkout normal no modo atual
- aprovado libera credito/beneficio uma vez
- pendente nao libera
- retorno do Mercado Pago nao libera sozinho sem backend
- se Brick estiver atras de flag, confirmar que nao foi ativado por acidente

### Observabilidade

- verificar logs Railway/Vercel apos os testes
- confirmar ausencia de payload bruto sensivel em novos registros de `PaymentAuditLog`
- confirmar eventos `payload_invalid` para upload rejeitado, quando aplicavel

## Comandos de teste consolidados (executados)

Frontend:

- `npm run test --workspace @earlycv/web`
- `npm run build --workspace @earlycv/web`

Backend:

- `npm run build --workspace @earlycv/api`
- `npm run test --workspace @earlycv/api -- src/plans/plans.service.spec.ts`
- `npm run test --workspace @earlycv/api -- src/payments/payments.service.spec.ts`
- `npm run test --workspace @earlycv/api -- src/payments/payments.controller.spec.ts`
- `npm run test --workspace @earlycv/api -- src/plans/plans-auto-unlock.e2e-spec.ts`
- `npm run test --workspace @earlycv/api -- src/cv-adaptation/cv-adaptation.service.spec.ts`
- `npm run test --workspace @earlycv/api -- src/common/cv-text-extractor.spec.ts`
- `npm run test --workspace @earlycv/api -- "src/analysis-protection/**/*.spec.ts"`
- `npm run test --workspace @earlycv/api -- src/common/admin-surface-guards.spec.ts`
- `npm run test --workspace @earlycv/api -- src/payments/payment-audit-sanitization.spec.ts`

AI package:

- `npm run test --workspace @earlycv/ai -- src/pdf-parser.spec.ts`

## Go / no-go

Go para deploy quando:

- testes focados relevantes estao verdes
- builds de web e api estao verdes
- diff de deploy nao contem alteracao funcional nao revisada
- checklist pos-deploy foi executado e sem achados bloqueantes

No-go quando:

- qualquer fluxo critico (pagamento, admin surface, upload pre-IA) falhar nos checks pos-deploy
- detectar vazamento de payload sensivel em logs/audit
- regressao de ownership/autorizacao em endpoint critico
