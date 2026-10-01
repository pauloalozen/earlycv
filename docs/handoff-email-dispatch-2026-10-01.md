# Handoff: dispatch de e-mails (relacionamento + compra) e aba "Emails" do admin

Checkpoint de 2026-10-01. Leia isto primeiro ao retomar. Detalhes técnicos: `docs/specs/2026-10-01-email-relationship-dispatch.md` (§1–§11). Roteiro operacional: `docs/runbook/email-relationship-activation.md`.

## 1. Onde o código está (nada foi publicado)
- Branch de trabalho: `feature/email-relationship-dispatch` (já integrada em `develop`).
- Commits: `aca25ec` (dispatch + confirmação de compra), `4261032` (aba Emails, configurações e templates no banco). Merges em `develop`: `d258190`, `23cef79`.
- `develop` está **4 commits à frente de `origin/develop` e NADA foi enviado ao remoto**. `main` intacta. Sem deploy, sem migration em banco persistente, sem alteração no Railway, sem e-mail real enviado. A migration (`20261001120000_email_relationship_dispatch`, só `CREATE`) só foi aplicada em Postgres descartável (containers removidos).
- Por que não houve push: não se sabe se o Railway acompanha `develop` (um push poderia disparar deploy + migration).

## 2. O que existe
- **Dispatch** (`apps/api/src/email-dispatch/`): outbox `EmailDispatch`, worker com claim atômico, dedupe, expiração, `OUTCOME_UNKNOWN` nunca reenvia; 3 tipos: `WELCOME`, `FEEDBACK_FIRST_USE` (RELATIONSHIP, SES, tópico + Configuration Set próprios, sem tracking) e `PURCHASE_CONFIRMATION` (BILLING/Resend, sem descadastro).
- **Compra:** gancho único em `PlansService.applyApprovedPurchaseInsideTransaction` (cobre webhook MP, `applyApprovedPurchase`, cupom 100%), insert em `SAVEPOINT`: falha do e-mail nunca derruba créditos. Recuperação de recibos perdidos: `npm run email:recover-purchase-confirmations -w apps/api` (ou botão em Emails → Compras).
- **Supressão compartilhada** (`EmailSuppression`: hard bounce Permanent + complaint), lida por Monitor e Product Updates. Descadastros por tópico seguem independentes.
- **Correção no Product Updates:** o handler do evento SES `Subscription` achava o contato em `subscription.source`, mas ali vem o mecanismo ("UnsubscribeHeader"); o e-mail está em `mail.destination[0]` e o status é `OptIn/OptOut`.
- **Transporte fake** fora de `APP_ENV=production` (inclusive ALLOWLIST). Teste real só via script com `--real-send`.
- **Configurações no banco** (`EmailDispatchSettings`) e **conteúdo editável** (`EmailDispatchTemplate`), editados em Admin → Emails. Modos/cutoff/allowlist/blocklist **não são mais env vars**. Sem configuração salva: tudo OFF, sem cutoff. LIVE exige confirmação; qualquer modo ligado exige cutoff.
- **Admin:** aba única "Emails" (Visão geral, Alerta de Vagas, Product Updates, Recuperação, Relacionamento, Compras, Templates, Supressões, Configurações). Rotas antigas mantidas; API em `/api/admin/emails`.
- **Observabilidade** (tokens nos logs do deploy): `email_dispatch_boot`, `..._not_ready`, `..._dependency_missing`, `..._enqueue_failed`, `..._settings_unreadable`, `..._templates_unreadable`, `..._settings_updated`, `purchase_confirmation_missing`, `email_dispatch_event`, `email_dispatch_subscription`, `email_suppression_decision`. Tabela completa no runbook §8.

## 3. AWS (preparada por Paulo; nada foi tocado por código)
Região `us-east-2` · contact list `earlycv-users` · tópicos `relationship` (OPT_IN) e `product-updates` · Configuration Set `earlycv-relationship-email` (SEND, REJECT, DELIVERY, BOUNCE, COMPLAINT, SUBSCRIPTION; sem OPEN/CLICK) · SNS `arn:aws:sns:us-east-2:163408842110:earlycv-email-events` (HTTPS confirmada, sem filtro, RawMessageDelivery=false) · endpoint `https://api.earlycv.com.br/api/monitor/webhooks/ses` · From `Paulo do EarlyCV <contato@earlycv.com.br>`, Reply-To `contato@earlycv.com.br`.

## 4. Variáveis do Railway
- Paulo já definiu 4: `AWS_SES_RELATIONSHIP_FROM_EMAIL`, `..._FROM_NAME`, `..._REPLY_TO`, `..._CONFIGURATION_SET`.
- **Falta** `AWS_SES_RELATIONSHIP_TOPIC_NAME=relationship` (obrigatória: sem ela o envio é recusado com `not_ready:list_management_not_configured`).
- **Não definir/ignoradas:** `EMAIL_WELCOME_MODE`, `EMAIL_FEEDBACK_MODE`, `EMAIL_PURCHASE_CONFIRMATION_MODE`, `EMAIL_RELATIONSHIP_*` (agora no banco).
- Conferir que existem: `APP_ENV=production`, `SES_EMAIL_ENABLED=true`, `AWS_SES_REGION=us-east-2`, `AWS_SES_CONTACT_LIST_NAME=earlycv-users`, `AWS_SES_PRODUCT_UPDATE_TOPIC_NAME=product-updates`, `AWS_SES_SNS_TOPIC_ARN=<o ARN acima>`, `RESEND_API_KEY`, `FRONTEND_URL`.

## 5. O QUE FALTA FAZER (ordem)
1. **Conferir o IAM** da chave `AWS_SES_ACCESS_KEY_ID`: `ses:SendEmail` no Configuration Set `earlycv-relationship-email` e na contact list `earlycv-users` (não verificado; sem isso o 1º envio real dá `AccessDenied`, inofensivo).
2. **Definir `AWS_SES_RELATIONSHIP_TOPIC_NAME`** no Railway.
3. **Publicar:** `npm run railway:touch-api` (convenção; o timestamp atual é de 01/10), abrir PR `feature/email-relationship-dispatch` → `main` (precisa enviar a branch ao remoto), merge, deploy. O deploy roda `prisma migrate deploy`.
4. **Pós-deploy, nos logs** (Railway MCP `get-logs`, filtro `email_dispatch`): migration aplicada; `email_dispatch_boot welcome=OFF feedback=OFF purchase=OFF startAt=unset transport=real`; **nenhum** `email_dispatch_dependency_missing` (se aparecer, reverter). Só então o webhook de produção processa `EMAIL_DISPATCH`.
5. **Teste real explícito** (só após o passo 4 verde e com confirmação de Paulo; roda contra credenciais SES de produção):
   `railway run -s <API> -- npm run email:test-relationship -w apps/api -- --kind welcome --to paulo.alozen@gmail.com --name Paulo --real-send --no-db` (a sintaxe `railway run -s` não foi testada; serviceId da API está na memória do projeto).
6. **Verificações V1–V5** (runbook §5): V1 entrega (`email_dispatch_event type=SENT/DELIVERED dispatchId=none`); V2 sem tracking (cabeçalho do Configuration Set, sem pixel, link de descadastro em texto e HTML, nenhum Open/Click); V3 descadastro **só de relationship** (`email_dispatch_subscription change=OPT_OUT` e Product Updates "unsupported_type"; `aws sesv2 get-contact` com `product-updates` intacto); V4 reenviar após o opt-out e ver o `email_suppression_decision` (esperado `action=ignored`; se `recorded`, **parar**: o filtro do bounce de opt-out precisa de ajuste); V5 comparar o JSON bruto do `Subscription` com os fixtures de `ses-subscription.util.spec.ts`.
7. **Só depois**, ativação gradual **pelo admin** (nunca env): Configurações → cutoff → por tipo Sombra → Só allowlist (contas de teste que NÃO sejam as 2 bloqueadas) → Ao vivo. Revisar textos em Templates antes. Ordem sugerida: compra → boas-vindas → feedback.

## 6. Pendências abertas / riscos conhecidos
- **Nunca validado com evento real:** o formato do `Subscription` (só fixtures da doc da AWS) e, principalmente, **o bounce que o SES gera ao enviar para contato descadastrado** (formato não documentado). O filtro ignora por subtipo (só `General|NoEmail|Suppressed|OnAccountSuppressionList` suprimem) e por diagnóstico que mencione opt-out/tópico, mas é palpite até o V4.
- **Efeitos ativos no deploy mesmo com tudo OFF** (não são envio): `EmailSuppression` passa a ser gravada/lida por Monitor e Product Updates; o descadastro de Product Updates passa a chegar ao banco; o webhook passa a rotear `EMAIL_DISPATCH` e o tópico `relationship`.
- **Resposta aos e-mails** não é mensurável automaticamente (sem integração com a caixa); abertura/clique não são coletados (sem tracking). Compra via Resend não tem webhook de entrega (só `status`/`providerMessageId`).
- Se `APP_ENV=production` estiver também em algum ambiente de homolog, o transporte real vale lá: manter os modos desligados/allowlist nesses ambientes.
- **Não foram migrados** (pedido explícito): Monitor, Product Updates (workers), Auth (OTP/reset), Payment Recovery.
- Testes web já quebrados, alheios: `admin/ingestion/actions.test.ts` (falta mock) e `admin/payment-recovery/page.test.tsx` (texto sem acento). `app.module.spec.ts` falha/trava no baseline neste ambiente.
- Fora de escopo ainda: nada de UI para trocar identidade/credenciais do SES; sem tela para remover uma supressão (só leitura).

## 7. Como retomar rápido
- Estado: `git checkout develop && git log --oneline -5` (deve mostrar `23cef79` no topo); `git status` limpo.
- Testes: `apps/api` precisa de Postgres (specs de auth/plans/admin-emails usam banco real). Padrão usado: `docker run -d --rm --name earlycv-tmp -e POSTGRES_PASSWORD=tmp -e POSTGRES_DB=earlycv_test -p 127.0.0.1:54340:5432 postgres:16-alpine`, `DATABASE_URL=… npx prisma migrate deploy --schema packages/database/prisma/schema.prisma`, rodar `tsx --test` com `DATABASE_URL`/`DATABASE_TEST_URL` apontando para ele, e **remover o container depois**. Não tocar nos containers `earlycv-bi-postgres` e `metabase`.
- Web: `cd apps/web && npx vitest run src/app/admin/emails src/app/admin/_components src/lib/admin-emails-*.test.ts`.
- Dry-run dos e-mails (nada é enviado nem gravado): `npm run email:test-relationship -w apps/api -- --kind welcome|feedback|purchase --to x@y.com --name Paulo`.
- Regras do Paulo que continuam valendo: nada em produção sem pedido explícito (nem SELECT); nunca DDL destrutivo; trabalho em `develop`/feature, nunca direto em `main`; respostas curtas.
