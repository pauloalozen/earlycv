# Security Hardening Checklist - EarlyCV

Data base: 2026-05-11
Ultima consolidacao: 2026-05-13
Branch de referencia: `hotfix/security-hardening-2026-05-11`

## Item 1 - Dominio / e-mail spoofing

- Status: **fechado com ressalva**
- Arquivos principais alterados: fora do monorepo (DNS/provedor de e-mail)
- Validacoes principais:
  - SPF/DKIM/DMARC validados
  - DMARC configurado em `p=quarantine`
- Testes/comandos rodados:
  - validacao operacional em provedores (Cloudflare/Zoho/Resend)
- Riscos residuais:
  - DMARC ainda nao esta em `p=reject`
- Validacoes pos-deploy necessarias:
  - monitorar deliverability e falsos positivos antes de promover para `reject`

## Item 2 - IDOR / autorizacao por objeto

- Status: **fechado**
- Arquivos principais alterados:
  - `apps/api/src/cv-adaptation/cv-adaptation.service.ts`
  - `apps/api/src/plans/plans.service.ts`
  - `apps/api/src/payments/payments.service.ts`
- Validacoes principais:
  - ownership por `userId` em fluxos criticos de checkout/status/adaptacao
  - acesso cruzado entre usuarios bloqueado
- Testes/comandos rodados:
  - cobertura focada em `cv-adaptation`, `plans` e `payments`
- Riscos residuais:
  - manter revisao continua de novos endpoints para prevenir regressao de ownership
- Validacoes pos-deploy necessarias:
  - smoke de acesso cruzado em recursos de pagamento e adaptacao

## Item 3 - Pagamento / webhook / idempotencia

- Status: **fechado**
- Arquivos principais alterados:
  - `apps/api/src/plans/plans.service.ts`
  - `apps/api/src/payments/payments.service.ts`
  - `apps/api/src/payments/payments.service.spec.ts`
  - `apps/api/src/plans/plans.service.spec.ts`
  - `apps/api/src/plans/plans-auto-unlock.e2e-spec.ts`
- Validacoes principais:
  - callback/query string nao concede beneficio isoladamente
  - replay/idempotencia de webhook validado
  - bloqueio de transicoes `completed/failed/refunded` no gate elegivel
  - ownership e auto-unlock validados
- Testes/comandos rodados:
  - `npm run test --workspace @earlycv/api -- src/plans/plans-auto-unlock.e2e-spec.ts` -> PASS
  - `npm run test --workspace @earlycv/api -- src/plans/plans.service.spec.ts` -> PASS
  - `npm run test --workspace @earlycv/api -- src/payments/payments.controller.spec.ts` -> PASS
  - `npm run test --workspace @earlycv/api -- src/payments/payments.service.spec.ts` -> PASS
- Riscos residuais:
  - e2e dependem de DB/env local para repetibilidade total
- Validacoes pos-deploy necessarias:
  - fluxo aprovado libera beneficio uma vez
  - fluxo pendente nao libera
  - replay nao duplica

## Item 4 - Upload PDF/DOCX/ODT + abuso IA/custo

- Status: **fechado**
- Arquivos principais alterados:
  - `apps/api/src/common/cv-file-formats.ts`
  - `apps/api/src/common/cv-text-extractor.ts`
  - `apps/api/src/common/cv-text-extractor.spec.ts`
  - `apps/api/src/cv-adaptation/cv-adaptation.service.ts`
  - `apps/api/src/cv-adaptation/cv-adaptation.service.spec.ts`
  - `packages/ai/src/pdf-parser.ts`
  - `packages/ai/src/pdf-parser.spec.ts`
  - `apps/web/src/app/adaptar/page.tsx`
- Validacoes principais:
  - DOC legado removido
  - DOCX/ODT com validacao de assinatura/estrutura
  - bloqueio pre-IA para arquivo/job description invalido
  - limites e timeout aplicados
- Testes/comandos rodados:
  - `npm run test --workspace @earlycv/api -- src/common/cv-text-extractor.spec.ts` -> PASS
  - `npm run test --workspace @earlycv/api -- src/cv-adaptation/cv-adaptation.service.spec.ts` -> PASS
  - `npm run test --workspace @earlycv/api -- "src/analysis-protection/**/*.spec.ts" src/cv-adaptation/cv-adaptation-protected-analyze.service.spec.ts` -> PASS
  - `npm run test --workspace @earlycv/ai -- src/pdf-parser.spec.ts` -> PASS
  - `npm run build --workspace @earlycv/api` -> PASS
- Riscos residuais:
  - `application/octet-stream` ainda aceito para DOCX/ODT, mitigado por assinatura/estrutura
- Validacoes pos-deploy necessarias:
  - PDF/DOCX/ODT validos pequenos
  - `.doc` rejeitado
  - falso PDF (renomeado) rejeitado

## Item 5 - Admin surface

- Status: **fechado com ressalva**
- Arquivos principais alterados:
  - `apps/web/src/app/admin/layout.tsx`
  - `apps/web/src/app/superadmin/layout.tsx`
  - `apps/web/src/app/robots.ts`
  - `apps/api/src/common/admin-surface-guards.spec.ts`
- Validacoes principais:
  - `notFound()` server-side em `/admin` e `/superadmin`
  - robots/sitemap/noindex revisados para superfices internas
  - guards/roles backend revisados para endpoints admin/superadmin
- Testes/comandos rodados:
  - `npm run test --workspace @earlycv/web` -> PASS
  - `npm run build --workspace @earlycv/web` -> PASS
  - `npm run test --workspace @earlycv/api -- src/common/admin-surface-guards.spec.ts src/payments/payments.controller.spec.ts src/analysis-protection/analysis-config.controller.spec.ts src/analysis-observability/admin-events.controller.spec.ts` -> PASS
- Riscos residuais:
  - validacao final em ambiente publicado ainda obrigatoria
- Validacoes pos-deploy necessarias:
  - checagem HTTP/body em `/admin` e `/superadmin` (comandos abaixo)

## Item 6 - CSP / headers

- Status: **fechado com ressalva**
- Arquivos principais alterados:
  - `apps/web/next.config.ts`
  - `apps/web/src/next-config-headers.spec.ts`
- Validacoes principais:
  - headers de seguranca endurecidos
  - `X-Robots-Tag` em admin/superadmin
  - CSP mantida em `Report-Only` por decisao operacional
- Testes/comandos rodados:
  - `npm run test --workspace @earlycv/web` -> PASS
  - `npm run build --workspace @earlycv/web` -> PASS
- Riscos residuais:
  - CSP ainda nao bloqueante (`Report-Only`)
- Validacoes pos-deploy necessarias:
  - confirmar headers nas rotas publicas e internas (comandos abaixo)

## Item 7 - Logs e alertas de seguranca

- Status: **fechado com ressalva**
- Arquivos principais alterados:
  - `apps/api/src/payments/payment-audit-sanitization.ts`
  - `apps/api/src/payments/payment-audit-sanitization.spec.ts`
  - `apps/api/src/plans/plans.service.ts`
  - `apps/api/src/payments/payments.service.ts`
  - `apps/api/src/cv-adaptation/cv-adaptation.service.ts`
  - `docs/runbook/security-incident-response.md`
- Validacoes principais:
  - `PaymentAuditLog.rawPayload` sanitizado (sem payload bruto completo)
  - erros de provider sanitizados (sem serializacao insegura)
  - telemetria minima de upload/parser via `payload_invalid`
- Testes/comandos rodados:
  - `npm run test --workspace @earlycv/api -- src/plans/plans.service.spec.ts src/payments/payments.service.spec.ts` -> PASS
  - `npm run test --workspace @earlycv/api -- src/cv-adaptation/cv-adaptation.service.spec.ts` -> PASS
  - `npm run test --workspace @earlycv/api -- src/common/cv-text-extractor.spec.ts` -> PASS
  - `npm run test --workspace @earlycv/api -- src/payments/payment-audit-sanitization.spec.ts` -> PASS
  - `npm run test --workspace @earlycv/api -- "src/analysis-protection/**/*.spec.ts"` -> PASS
  - `npm run build --workspace @earlycv/api` -> PASS
- Riscos residuais:
  - `requestId/correlationId` nativo em `PaymentAuditLog` ficou como P1 (sem migration nesta rodada)
  - alertas automáticos dedicados ainda P1
- Validacoes pos-deploy necessarias:
  - checar novos registros de `PaymentAuditLog` sem payload sensivel bruto
  - checar eventos `payload_invalid` para rejeicoes upload/parser

## Item 8 - Evidencia final / go-no-go deploy

- Status: **fechado**
- Arquivos principais alterados:
  - `docs/security/security-hardening-checklist.md`
  - `docs/security/security-evidence-2026-05-11.md`
  - `docs/runbook/security-incident-response.md`
- Validacoes principais:
  - consolidacao de riscos residuais aceitos
  - checklist de validacao pos-deploy consolidado
  - criterio objetivo de go/no-go documentado
- Testes/comandos rodados:
  - build e testes focados registrados na evidencia final
- Riscos residuais:
  - dependencias de ambiente para suites integrais/e2e
- Validacoes pos-deploy necessarias:
  - executar bloco completo de comandos abaixo

## Checklist pos-deploy consolidado

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

- upload PDF valido pequeno
- upload DOCX valido pequeno
- upload ODT valido pequeno (se viavel)
- upload `.doc` rejeitado
- arquivo invalido renomeado para `.pdf` rejeitado
- mensagem de erro controlada

### Pagamento

- checkout normal no modo atual
- aprovado libera beneficio uma vez
- pendente nao libera
- retorno do MP nao libera sozinho sem backend
- se Brick estiver atras de flag, confirmar que nao foi ativado por acidente

### Observabilidade

- revisar logs Railway/Vercel apos os testes
- confirmar ausencia de payload bruto sensivel em novos registros de `PaymentAuditLog`
- confirmar emissao de `payload_invalid` em rejeicoes de upload/parser
