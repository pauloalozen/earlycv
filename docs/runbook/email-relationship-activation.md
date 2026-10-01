# Publicação, teste real e ativação: relacionamento + confirmação de compra

Spec: `docs/specs/2026-10-01-email-relationship-dispatch.md`. **Tudo nasce OFF** (`WELCOME`, `FEEDBACK_FIRST_USE`, `PURCHASE_CONFIRMATION`).
Este runbook cobre: (1) estado AWS, (2) variáveis Railway, (3) sequência migration/deploy, (4) teste real explícito, (5) verificações, (6) reverter, (7) ativação gradual, (8) observabilidade e recuperação.

## 1. Estado AWS (confirmado por Paulo; conferência somente-leitura)
Região `us-east-2` · contact list `earlycv-users` · tópicos `relationship` (OPT_IN) + `product-updates` (preservado) · Configuration Set `earlycv-relationship-email` (SEND, REJECT, DELIVERY, BOUNCE, COMPLAINT, SUBSCRIPTION; **sem OPEN/CLICK**) · SNS `arn:aws:sns:us-east-2:163408842110:earlycv-email-events` (assinatura HTTPS confirmada, sem filtro, `RawMessageDelivery=false`) · endpoint `https://api.earlycv.com.br/api/monitor/webhooks/ses` · From `Paulo do EarlyCV <contato@earlycv.com.br>` · Reply-To `contato@earlycv.com.br`.

Comandos de conferência (somente leitura, rodar localmente):
```
aws sesv2 get-contact-list --contact-list-name earlycv-users --region us-east-2        # 2 tópicos; relationship com DefaultSubscriptionStatus OPT_IN
aws sesv2 get-configuration-set --configuration-set-name earlycv-relationship-email --region us-east-2   # sem TrackingOptions
aws sesv2 get-configuration-set-event-destinations --configuration-set-name earlycv-relationship-email --region us-east-2   # nenhum OPEN/CLICK; destino = o ARN SNS acima
aws sns list-subscriptions-by-topic --topic-arn arn:aws:sns:us-east-2:163408842110:earlycv-email-events --region us-east-2   # HTTPS, SubscriptionArn confirmada
aws sns get-subscription-attributes --subscription-arn <arn> --region us-east-2        # RawMessageDelivery=false, sem FilterPolicy
```
**Verificar também (não confirmado):** a política IAM da chave `AWS_SES_ACCESS_KEY_ID` precisa permitir `ses:SendEmail` nos recursos novos, não só nos antigos:
`arn:aws:ses:us-east-2:163408842110:configuration-set/earlycv-relationship-email` e `arn:aws:ses:us-east-2:163408842110:contact-list/earlycv-users` (além da identidade `contato@earlycv.com.br`). Se faltar, o 1º envio real falha com `AccessDenied` (inofensivo, mas pare e corrija).

## 2. Variáveis Railway (serviço API, ambiente production)

**Adicionar (novas):**
```
AWS_SES_RELATIONSHIP_FROM_EMAIL=contato@earlycv.com.br
AWS_SES_RELATIONSHIP_FROM_NAME=Paulo do EarlyCV
AWS_SES_RELATIONSHIP_REPLY_TO=contato@earlycv.com.br
AWS_SES_RELATIONSHIP_CONFIGURATION_SET=earlycv-relationship-email
AWS_SES_RELATIONSHIP_TOPIC_NAME=relationship
EMAIL_WELCOME_MODE=OFF
EMAIL_FEEDBACK_MODE=OFF
EMAIL_PURCHASE_CONFIRMATION_MODE=OFF
```
**NÃO definir agora** (ausência = fail-closed): `EMAIL_RELATIONSHIP_START_AT`, `EMAIL_RELATIONSHIP_ALLOWLIST`, `EMAIL_RELATIONSHIP_BLOCKLIST`. Sem `START_AT` válido, **nenhum** modo funciona mesmo que alguém ligue um por engano; o teste explícito não depende dele.

**Conferir que já existem com estes valores (não alterar):**
```
APP_ENV=production                      # transporte real SÓ com este valor exato
SES_EMAIL_ENABLED=true
AWS_SES_REGION=us-east-2
AWS_SES_ACCESS_KEY_ID / AWS_SES_SECRET_ACCESS_KEY
AWS_SES_CONFIGURATION_SET=earlycv-bulk-email        # o compartilhado (Monitor/Product Updates). NUNCA igual ao de relacionamento
AWS_SES_CONTACT_LIST_NAME=earlycv-users
AWS_SES_PRODUCT_UPDATE_TOPIC_NAME=product-updates   # diferente de relationship
AWS_SES_SNS_TOPIC_ARN=arn:aws:sns:us-east-2:163408842110:earlycv-email-events   # o webhook rejeita eventos de outro TopicArn
RESEND_API_KEY                                       # exigida pela confirmação de compra (transporte real)
FRONTEND_URL=https://earlycv.com.br                  # link da boas-vindas
```
Conferência (nomes, sem valores): `railway variables --kv | cut -d= -f1 | sort` (ou o painel). Definir as novas variáveis **antes** do deploy (versão antiga ignora o que não conhece); agrupe tudo num único deploy para evitar redeploys intermediários.

## 3. Sequência de migration e deploy (todos os automáticos OFF)
1. **Branch**: `git checkout develop && git checkout -b feature/email-relationship-dispatch` (a partir do `develop` atual; nada commitado ainda). `npm run railway:touch-api` imediatamente antes do commit (convenção: grava `apps/api/.railway-redeploy`). Commit com os 62+ arquivos (revisados; ver spec §10.5). **Não commitar `.env` reais.**
2. **PR para `main`** (padrão dos PRs #60–#62). Revisão do diff; CI/testes verdes.
3. Variáveis do §2 já definidas. **Merge** → Railway faz o deploy; o container roda `prisma migrate deploy` antes de subir. A migration `20261001120000_email_relationship_dispatch` é **só `CREATE`** (4 tabelas, 4 enums, índices, 2 FKs): sem lock em tabela existente, sem backfill.
4. **Comportamento já ativo no deploy, independente dos modos** (não é envio; é restrição/correção):
   - hard bounce `Permanent` e complaint passam a ser gravados em `EmailSuppression`, e Monitor/Product Updates pulam esses endereços (tabela nasce vazia: nada muda até chegar um bounce/complaint novo);
   - o descadastro de **Product Updates** via SES passa a chegar ao banco (o handler antigo nunca achava o usuário: `source` não é o e-mail);
   - o webhook passa a rotear `EMAIL_DISPATCH` e o tópico `relationship`;
   - o gancho de compra e os ganchos de auth existem mas, com modo OFF, não fazem **nenhuma** consulta.
5. **Pós-deploy (obrigatório antes do teste real)**, nos logs do deploy (Railway MCP `get-logs`, filtro `email_dispatch`, ou painel):
   - `All migrations have been successfully applied`;
   - `email_dispatch_boot welcome=OFF feedback=OFF purchase=OFF startAt=unset transport=real` (**transport=real** é o esperado em produção; modos OFF);
   - **ausência** de `email_dispatch_dependency_missing` (se aparecer, a fiação falhou: **não** prossiga; reverta);
   - `GET /api/health` ok; Monitor/Product Updates inalterados (sem erro novo).
   Só com isso o handler novo está publicado e o webhook de produção consegue processar `EMAIL_DISPATCH`.

## 4. Teste real explícito para paulo.alozen@gmail.com (um envio, sem banco, sem automáticos)
Executa **em produção por decisão explícita** (usa as credenciais SES de produção; o webhook de produção grava os eventos). `--no-db` = o script **não abre o banco** nem cria `EmailDispatch`; envia 1 e-mail, só relacionamento, só para o endereço informado.
Dry-run primeiro (nada enviado): 
```
railway run -s <API> -- npm run email:test-relationship -w apps/api -- --kind welcome --to paulo.alozen@gmail.com --name Paulo
```
Envio real (rodar só depois do §3.5 verde e com sua confirmação):
```
railway run -s <API> -- npm run email:test-relationship -w apps/api -- --kind welcome --to paulo.alozen@gmail.com --name Paulo --real-send --no-db
```
Saída esperada: `"sent": true`, `outcome: "SENT"`, `providerMessageId` (id SES) e `dispatchId: manual-<uuid>`. Se `not_ready:<motivo>`, nada foi enviado (variável/IAM faltando). O script recusa lista de destinatários, mais de um `--to`, `--fake-send` junto de `--real-send` etc.

## 5. Verificações do teste (logs: Railway MCP `get-logs` com os filtros abaixo, ~1–2 min após o envio)
| # | O que provar | Como | Esperado |
|---|---|---|---|
| V1 | Entrega | log `email_dispatch_event` | `type=SENT dispatchId=none` e `type=DELIVERED dispatchId=none` (none = envio sem banco). E-mail na caixa, From `Paulo do EarlyCV`, Reply-To `contato@earlycv.com.br`. |
| V2 | **Sem tracking** | "Mostrar original" no Gmail + logs | Cabeçalho `X-SES-CONFIGURATION-SET: earlycv-relationship-email`; **nenhuma** `<img>`/pixel; links não reescritos; link de descadastro presente no **texto e no HTML** (e "Cancelar inscrição" do Gmail via `List-Unsubscribe`); **nenhum** log `not processed: unsupported_type (type=Open|Click)` (filtro `unsupported_type`). Confirmar também `get-configuration-set-event-destinations`. |
| V3 | **Descadastro só de relationship** | Abra o link do rodapé; na página do SES desmarque **apenas** `relationship` (nunca "cancelar tudo"). Logs: `email_dispatch_subscription change=OPT_OUT userId=<id>` **e** `product update subscription webhook not processed: unsupported_type`. CLI: `aws sesv2 get-contact --contact-list-name earlycv-users --email-address paulo.alozen@gmail.com --region us-east-2` | `relationship` = OPT_OUT; `product-updates` **inalterado**. |
| V4 | Bounce de opt-out não suprime | Repita o envio real (§4) **depois** do V3. O SES não entrega e gera `Bounce`. Logs: `email_suppression_decision event=Bounce ...` | `action=ignored` (`reason=optout_diagnostic` ou `subtype_not_hard`) e **nenhum** `email suppression recorded` para esse endereço. Guarde a linha: `type/subtype/diagnostic` revelam o formato real do bounce (formato não documentado). Se aparecer `action=recorded`/`email suppression recorded` para um bounce de opt-out, **pare**: o filtro precisa de ajuste antes de qualquer ativação. |
| V5 | Payload real do `Subscription` | Compare o JSON bruto do SNS (CloudWatch/SNS) com os fixtures de `ses-subscription.util.spec.ts` | `mail.destination[0]` = contato, `source` = mecanismo, status `OptOut`/`OptIn`. Divergência → ajustar o parser **antes** de ativar. |

Limpeza (opcional): reinscrever relationship pelo SES (`aws sesv2 update-contact --contact-list-name earlycv-users --email-address paulo.alozen@gmail.com --topic-preferences TopicName=relationship,SubscriptionStatus=OPT_IN --region us-east-2`). A API **não** garante emitir evento `Subscription` para alterações por API; a conta do Paulo é excluída da automação de qualquer forma, então `RelationshipEmailPreference` ficar `false` é inofensivo. Não rode SQL em produção para ajustar.

## 6. Reverter
- Sem efeito em runtime a desfazer: modos já OFF. Para voltar o **código**: reverter o merge do PR (a migration é aditiva; as tabelas ficam, sem uso).
- Para parar qualquer envio depois de ativado: modo `OFF` (ou remover `EMAIL_RELATIONSHIP_START_AT`); pendências expiram sozinhas.

## 7. Ativação gradual (depois de validar §5; um tipo por vez, ordem sugerida: compra → boas-vindas → feedback)
Definir `EMAIL_RELATIONSHIP_START_AT=<ISO do dia da ativação>` e então, por tipo: `SHADOW` (nunca envia; conferir volume/variantes) → `ALLOWLIST` + `EMAIL_RELATIONSHIP_ALLOWLIST=<contas de teste que NÃO são as 2 bloqueadas>` → `LIVE`. Fora de produção o transporte é **fake em qualquer modo**; em produção `ALLOWLIST` envia só aos listados.

## 8. Observabilidade e recuperação (tokens estáveis nos logs do deploy)
| Token | Nível | Significa | Ação |
|---|---|---|---|
| `email_dispatch_boot ...` | log | modos, cutoff, transporte (real/fake) a cada boot | conferir "tudo OFF" após deploy |
| `email_dispatch_not_ready kind=X reason=Y` | warn | modo ligado + transporte real + infra incompleta (nada será enviado) | corrigir variável/IAM |
| `email_dispatch_dependency_missing consumer=Z` | warn | fiação quebrada: Plans/Auth/webhook sem a dependência (recurso desligado em silêncio) | reverter; é bug de DI |
| `email_dispatch_enqueue_failed kind=PURCHASE_CONFIRMATION purchaseId=<id> credits_unaffected=true reason=...` | error | o enqueue da confirmação falhou; **créditos e compra estão corretos** | `purchase_confirmation_missing` aparece ≤10 min depois; recuperar (abaixo) |
| `email_dispatch_enqueue_failed kind=RELATIONSHIP userId=<id>` | error | boas-vindas/feedback não criados para esse usuário | investigar `reason` |
| `purchase_confirmation_missing count=N oldest=<ISO> recover="..."` | warn (a cada 10 min enquanto houver) | compras concluídas nas últimas 24h **sem** linha de confirmação | rodar a recuperação |
| `email_dispatch_event type=... dispatchId=...` / `email_dispatch_subscription change=...` | log | webhook processou entrega/descadastro | usado no §5 |
| `email_suppression_decision ...` | log | decisão sobre cada Bounce (com diagnóstico sem e-mail) | §5 V4 |

**Recuperar confirmações perdidas** (dry-run por padrão; só ids opacos, sem e-mail):
```
railway run -s <API> -- npm run email:recover-purchase-confirmations -w apps/api                      # lista
railway run -s <API> -- npm run email:recover-purchase-confirmations -w apps/api -- --apply            # cria as linhas faltantes
railway run -s <API> -- npm run email:recover-purchase-confirmations -w apps/api -- --since-hours 48 --apply
```
Janela padrão 24h (validade de um recibo; máx. 72h). Idempotente (dedupe por compra), respeita modo e cutoff (modo OFF = não cria nada). A detecção **só loga**; nunca recria sozinha (ligar o modo mais tarde não manda recibos antigos). Quem envia é o worker, conforme o modo.

## Consultas úteis (**somente em local/homolog**; nunca em produção)
- Estado: `select kind,status,"skippedReason",count(*) from "EmailDispatch" where "isTest"=false group by 1,2,3;`
- Entrega: `EmailDispatchEvent` por `type`. Compra (Resend): só `status`/`providerMessageId` (sem webhook de entrega do Resend neste código).
- Supressões: `select reason,"bounceSubType","sourceCategory",count(*) from "EmailSuppression" group by 1,2,3;`
